import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), "..");
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const digest = (data) => createHash("sha256").update(data).digest("hex");
const sensitive = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|\.git|\.ssh|\.aws|\.azure|\.config)$|(?:credential|secret|password|cookie|token)|\.(?:pem|key|pfx|p12)$/i;
const skipped = new Set(["node_modules", ".git", "__pycache__", ".cache", ".venv"]);
const licenseName = /licen[cs]e|copying|notice/i;
const codeExtension = /\.(?:[cm]?js|tsx?|jsx|css|html|json|py|ps1|cmd|ya?ml)$/i;

class ManifestError extends Error {}

function within(parent, target) {
  const rel = path.relative(parent, target);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

async function local(file) {
  if (!within(root, path.resolve(file)) || path.resolve(file).split(path.sep).some((part) => sensitive.test(part))) {
    throw new ManifestError("許可範囲外または認証情報の可能性がある入力を拒否しました。");
  }
  const resolved = await realpath(file);
  if (!within(root, resolved) || resolved.split(path.sep).some((part) => sensitive.test(part))) {
    throw new ManifestError("プロジェクト外または認証情報へのリンクを拒否しました。");
  }
  return resolved;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
}

async function read(file) {
  return readFile(await local(file), "utf8");
}

async function json(file) {
  return JSON.parse(await read(file));
}

async function hashFile(file) {
  const hash = createHash("sha256");
  const resolved = await local(file);
  const before = await stat(resolved);
  for await (const chunk of createReadStream(resolved)) hash.update(chunk);
  const after = await stat(resolved);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new ManifestError("検査中に入力が変更されました。ビルド終了後に新しい出力先で再実行してください。");
  }
  return { path: relative(file), sha256: hash.digest("hex"), size: after.size };
}

async function walk(dir, visit) {
  if (!(await exists(dir))) return;
  await local(dir);
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    if (entry.isSymbolicLink() || sensitive.test(entry.name) || skipped.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file, visit);
    else if (entry.isFile()) await visit(file);
  }
}

function argumentsFrom(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!["--out", "--installer", "--artifact"].includes(key) || !argv[i + 1] || argv[i + 1].startsWith("--") || args[key]) {
      throw new ManifestError("使い方: node scripts/generate-desktop-manifest.mjs --out <path> [--artifact <exe-or-zip>]");
    }
    args[key] = path.resolve(argv[i + 1]);
  }
  if (!args["--out"]) throw new ManifestError("--out <path> は必須です。");
  return args;
}

function run(file, args) {
  return execFileSync(file, args, { cwd: root, encoding: "utf8", timeout: 15000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function gitState() {
  try {
    const head = run("git", ["rev-parse", "HEAD"]);
    // --quiet は変更ファイル名を取得せず、未追跡は有無だけに縮約する。
    const changed = (args) => {
      try {
        run("git", args);
        return false;
      } catch (error) {
        if (error.status === 1) return true;
        throw error;
      }
    };
    const tracked = changed(["diff", "--quiet", "--no-ext-diff", "--ignore-submodules=none"])
      || changed(["diff", "--cached", "--quiet", "--no-ext-diff", "--ignore-submodules=none"]);
    const untracked = run("git", ["ls-files", "--others", "--exclude-standard", "-z"]).length > 0;
    return { head, dirty: tracked || untracked, note: "参照専用。変更・未追跡ファイル名は保存しない。" };
  } catch {
    return { head: null, dirty: null, note: "Git状態を取得できないため不明。" };
  }
}

function publicUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.replace(/^git\+/, ""));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function npmLicense(pkg) {
  const value = pkg.license ?? pkg.licenses;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : item.type).filter(Boolean).join(" OR ");
  return value?.type || null;
}

async function resolvePackage(name, from) {
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name) || name.split("/").some((part) => part === "..")) {
    throw new ManifestError("不正な依存パッケージ名です。");
  }
  for (let dir = from; within(root, dir); dir = path.dirname(dir)) {
    if (path.basename(dir) !== "node_modules") {
      const candidate = path.join(dir, "node_modules", name, "package.json");
      if (await exists(candidate)) return path.dirname(await local(candidate));
    }
    if (dir === root) break;
  }
  return null;
}

async function productionPackages(project) {
  const packages = new Map();
  const missing = [];
  const optionalNotInstalled = [];
  const visited = new Set();
  async function dependencies(pkg, dir) {
    const required = { ...pkg.dependencies, ...pkg.optionalDependencies };
    const peers = pkg.peerDependencies || {};
    for (const name of Object.keys({ ...required, ...peers }).sort()) {
      const optional = Object.hasOwn(pkg.optionalDependencies || {}, name)
        || (!Object.hasOwn(required, name) && pkg.peerDependenciesMeta?.[name]?.optional === true);
      const found = await resolvePackage(name, dir);
      if (!found) {
        (optional ? optionalNotInstalled : missing).push({ name, requestedBy: `${pkg.name}@${pkg.version}` });
        continue;
      }
      if (visited.has(found)) continue;
      visited.add(found);
      const metadata = await json(path.join(found, "package.json"));
      const key = `${metadata.name}@${metadata.version}`;
      const entry = packages.get(key) || {
        name: metadata.name, version: metadata.version, license: npmLicense(metadata),
        upstream: publicUrl(metadata.repository?.url ?? metadata.repository) ?? publicUrl(metadata.homepage),
        locations: [], licenseFiles: [],
      };
      entry.locations.push(relative(found));
      packages.set(key, entry);
      await dependencies(metadata, found);
    }
  }
  await dependencies(await json(path.join(project, "package.json")), project);
  return { packages: [...packages.values()].sort((a, b) => a.name.localeCompare(b.name, "en") || a.version.localeCompare(b.version)), missing, optionalNotInstalled };
}

function metadataHeaders(text) {
  const headers = new Map();
  let last;
  for (const line of text.split(/\r?\n/)) {
    if (!line) break;
    if (/^[ \t]/.test(line) && last) {
      const values = headers.get(last);
      values[values.length - 1] += `\n${line.trim()}`;
    } else {
      const match = /^([^:]+):\s*(.*)$/.exec(line);
      if (!match) continue;
      last = match[1].toLowerCase();
      headers.set(last, [...(headers.get(last) || []), match[2]]);
    }
  }
  return headers;
}

async function sourceHashes() {
  const files = new Map();
  for (const dir of ["apps/desktop/src", "apps/desktop/electron", "apps/desktop/test", "apps/desktop/scripts", "server/src", "server/test", "web/src", "shared"]) {
    await walk(path.join(root, dir), async (file) => {
      if (codeExtension.test(file)) files.set(relative(file), await hashFile(file));
    });
  }
  for (const project of ["apps/desktop", "server", "web"]) {
    for (const entry of await readdir(path.join(root, project), { withFileTypes: true })) {
      if (entry.isFile() && /^(?:package(?:-lock)?\.json|pnpm-(?:lock|workspace)\.yaml|(?:tsconfig.*|vite\.config)\.(?:json|ts)|index\.html)$/.test(entry.name)) {
        const file = path.join(root, project, entry.name);
        files.set(relative(file), await hashFile(file));
      }
    }
  }
  for (const name of ["generate-desktop-manifest.mjs", "build-desktop-distribution.ps1", "prepare-desktop-bundle-tools.ps1", "desktop-analysis-requirements.txt", "desktop-analysis-requirements.lock.txt", "desktop-python-build.lock.txt", "desktop-python-archives.json", "desktop-analysis-models.lock.json", "lock-desktop-python.mjs", "verify-desktop-python.py", "audit-desktop-public-release.ps1", "local-node.ps1", "warmup-demucs.ps1"]) {
    const file = path.join(root, "scripts", name);
    if (await exists(file)) files.set(relative(file), await hashFile(file));
  }
  const workflow = path.join(root, ".github/workflows/build-desktop-installer.yml");
  if (await exists(workflow)) files.set(relative(workflow), await hashFile(workflow));
  const entries = [...files.values()].sort((a, b) => a.path.localeCompare(b.path, "en"));
  return {
    scope: "Desktop/Server/Web/共有のコード・設定・テスト、配布関連スクリプトとlockのみ。依存本体・モデル・ビルド複製・資料・認証情報は対象外。",
    aggregateSha256: digest(entries.map((entry) => `${entry.path}\0${entry.sha256}\n`).join("")),
    files: entries,
  };
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2));
  const out = args["--out"];
  const recordPath = path.join(out, "04_ビルド記録.json");
  const noticePath = path.join(out, "05_同梱ライセンス.txt");
  for (const file of [recordPath, noticePath]) {
    if (await exists(file)) throw new ManifestError("04/05が既に存在します。上書きせず、新しい --out を指定してください。");
  }
  const artifactPath = args["--artifact"] || args["--installer"];
  if (artifactPath) await local(artifactPath);
  const desktop = await json(path.join(root, "apps/desktop/package.json"));
  const server = await json(path.join(root, "server/package.json"));
  const unknown = [];
  const licenseCopies = new Map();
  const pending = new Map();

  async function collect(file) {
    if (licenseCopies.has(file)) return licenseCopies.get(file);
    const resolved = await local(file);
    if ((await stat(resolved)).size > 32 * 1024 * 1024) throw new ManifestError("ライセンス候補が大きすぎるため中止しました。");
    const bytes = await readFile(resolved);
    if (bytes.includes(0)) throw new ManifestError("ライセンス候補にバイナリデータがあるため中止しました。");
    const sha256 = digest(bytes);
    const original = relative(file);
    const extension = path.extname(file);
    const suffix = /^\.(?:txt|md|rst|html?)$/i.test(extension) ? extension.toLowerCase() : ".txt";
    const saved = `licenses/${digest(original).slice(0, 16)}-${sha256.slice(0, 16)}${suffix}`;
    const result = { source: original, saved, sha256, size: bytes.length };
    licenseCopies.set(file, result);
    pending.set(saved, bytes);
    return result;
  }

  async function collectTree(dir) {
    const result = [];
    await walk(dir, async (file) => {
      if (licenseName.test(path.basename(file)) && !/\.(?:[cm]?js|py[co]?|exe|dll|so|pyd|h|c)$/i.test(file)) result.push(await collect(file));
    });
    return result;
  }

  function checkLicense(component, license, licenseFiles) {
    if (!license || /^(?:unknown|none|noassertion)$/i.test(license.trim())) unknown.push({ component, reason: "ライセンス識別子が未記載または不明。実本文を確認すること。" });
    if (!licenseFiles.length) unknown.push({ component, reason: "実ライセンステキストを検出できない。" });
  }

  const npm = {};
  for (const project of ["server", "apps/desktop"]) {
    const inventory = await productionPackages(path.join(root, project));
    for (const pkg of inventory.packages) {
      for (const location of pkg.locations) pkg.licenseFiles.push(...await collectTree(path.join(root, location)));
      checkLicense(`${project}: ${pkg.name}@${pkg.version}`, pkg.license, pkg.licenseFiles);
    }
    for (const item of inventory.missing) unknown.push({ component: `${project}: ${item.name}`, reason: `必須本番依存をローカル解決できない（要求元 ${item.requestedBy}）。` });
    npm[project] = inventory;
  }

  const pythonRoot = path.join(root, "tools/python-packages");
  const metadataFiles = [];
  const supplemental = [];
  await walk(pythonRoot, async (file) => {
    if (path.basename(file) === "METADATA" && path.dirname(file).endsWith(".dist-info")) metadataFiles.push(file);
    else if (licenseName.test(path.basename(file)) && !/\.(?:py[co]?|exe|dll|so|pyd|h|c)$/i.test(file)) supplemental.push(file);
  });
  const pythonPackages = [];
  for (const file of metadataFiles) {
    const info = path.dirname(file);
    const headers = metadataHeaders(await read(file));
    const first = (key) => headers.get(key)?.[0] || null;
    const pkg = {
      name: first("name"), version: first("version"), license: first("license"), licenseExpression: first("license-expression"),
      metadata: await hashFile(file), vendored: path.dirname(info) !== pythonRoot,
      declaredLicenseFiles: headers.get("license-file") || [], licenseFiles: await collectTree(info), missingLicenseFiles: [],
    };
    for (const declared of pkg.declaredLicenseFiles) {
      const candidates = [path.join(info, "licenses", declared), path.join(info, declared), path.join(path.dirname(info), declared)];
      const found = [];
      for (const candidate of candidates) {
        if (within(info, candidate) || within(path.dirname(info), candidate)) {
          if (await exists(candidate) && (await stat(await local(candidate))).isFile()) found.push(candidate);
        }
      }
      if (!found.length) pkg.missingLicenseFiles.push(declared);
      for (const candidate of found) {
        const entry = await collect(candidate);
        if (!pkg.licenseFiles.some((item) => item.source === entry.source)) pkg.licenseFiles.push(entry);
      }
    }
    const component = `Python: ${pkg.name}@${pkg.version}`;
    checkLicense(component, pkg.licenseExpression || pkg.license, pkg.licenseFiles);
    if (pkg.missingLicenseFiles.length) unknown.push({ component, reason: `License-Fileで宣言された本文が未検出: ${pkg.missingLicenseFiles.join(", ")}` });
    pythonPackages.push(pkg);
  }
  if (!metadataFiles.length) unknown.push({ component: "Pythonパッケージ", reason: "tools/python-packages のMETADATAを検出できない。" });
  const pythonSupplemental = [];
  for (const file of supplemental) {
    if (!licenseCopies.has(file)) pythonSupplemental.push(await collect(file));
  }

  const pythonRuntime = { version: null, licenseFiles: await collectTree(path.join(root, "tools/python")) };
  const pythonExe = path.join(root, "tools/python", process.platform === "win32" ? "python.exe" : "bin/python3");
  if (await exists(pythonExe)) {
    try { pythonRuntime.version = run(await local(pythonExe), ["--version"]); } catch { /* 不明のまま記録する。 */ }
  }
  if (!pythonRuntime.licenseFiles.length) unknown.push({ component: "Python本体", reason: "tools/python の実LICENSEが未検出。" });

  const electronDir = await resolvePackage("electron", path.join(root, "apps/desktop"));
  const electron = { version: null, licenseFiles: [], source: null };
  if (electronDir) {
    electron.version = (await json(path.join(electronDir, "package.json"))).version;
    for (const name of ["LICENSE", "dist/LICENSE", "dist/LICENSES.chromium.html"]) {
      const file = path.join(electronDir, name);
      if (await exists(file)) electron.licenseFiles.push(await collect(file));
    }
    electron.source = "開発環境にインストール済みのElectronランタイム。dev依存グラフには含めず別記。";
  }
  if (!electron.licenseFiles.some((item) => item.source.endsWith("LICENSES.chromium.html"))) {
    for (const name of ["LICENSE.electron.txt", "LICENSES.chromium.html"]) {
      const file = path.join(root, "apps/desktop/release/win-unpacked", name);
      if (await exists(file)) electron.licenseFiles.push(await collect(file));
    }
    electron.source = "release/win-unpackedのライセンスを補足利用。現在ソースとの対応は未確認。";
  }
  if (!electron.licenseFiles.length) unknown.push({ component: "Electron/Chromium", reason: "ランタイムのライセンス本文が未検出。" });

  const binaries = [];
  for (const [name, binary] of [
    ["ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"],
    ["ffprobe-static", `bin/${process.platform}/${process.arch}/${process.platform === "win32" ? "ffprobe.exe" : "ffprobe"}`],
  ]) {
    const pkg = npm.server.packages.find((entry) => entry.name === name);
    const item = { name, path: null, sha256: null, size: null, versionOutput: null, licenseOutput: null, gplEnabled: null, version3Enabled: null, upstreamUrls: [], sourceCorrespondence: "未確認。正確なバイナリ版・ビルド構成・静的リンク依存に対応するソースと配布方法を配布前に確認する。URL一覧だけでは対応ソースの提供確認にならない。" };
    if (pkg) {
      const dir = path.join(root, pkg.locations[0]);
      const exe = path.join(dir, binary);
      if (pkg.upstream) item.upstreamUrls.push(pkg.upstream);
      const readme = path.join(dir, "README.md");
      if (await exists(readme)) {
        for (const match of (await read(readme)).matchAll(/https?:\/\/[^\s<>\[\]()"`]+/g)) {
          const url = publicUrl(match[0]);
          if (url && !item.upstreamUrls.includes(url)) item.upstreamUrls.push(url);
        }
      }
      if (await exists(exe)) {
        Object.assign(item, await hashFile(exe));
        try {
          item.versionOutput = run(await local(exe), ["-version"]);
          item.licenseOutput = run(await local(exe), ["-L"]);
          item.gplEnabled = /--enable-gpl\b/.test(item.versionOutput);
          item.version3Enabled = /--enable-version3\b/.test(item.versionOutput);
        } catch {
          unknown.push({ component: name, reason: "実行ファイルの -version / -L を実行できない。対象OSで再確認する。" });
        }
      } else unknown.push({ component: name, reason: "実行ファイルが未検出。" });
    }
    unknown.push({ component: `${name} 対応ソース`, reason: item.sourceCorrespondence });
    binaries.push(item);
  }
  unknown.push({ component: "Demucsモデル重み・Python/Electron内の追加第三者部品", reason: "モデル重みやDLL等の個別条件と対応ソースの網羅確認は未実施。本文収集だけで配布適合とは判定しない。" });

  const artifact = artifactPath ? {
    ...await hashFile(artifactPath),
    format: path.extname(artifactPath).toLowerCase() === ".zip" ? "zip" : "installer",
    note: "指定ファイルのハッシュとサイズのみ検証。現在ソースから生成されたこと・署名・動作・ライセンス適合は未証明。",
  } : null;
  const hashes = await sourceHashes();
  const record = {
    schemaVersion: 1, generatedAtUtc: new Date().toISOString(),
    note: "ローカル入力の検査時点の記録。ビルド実行・再現性・配布許可の証明ではない。ネットワーク取得なし。",
    package: { name: desktop.name, version: desktop.version },
    serverPackage: { name: server.name, version: server.version },
    git: gitState(), environment: { os: process.platform, arch: process.arch, node: process.version },
    hashes, artifact, installer: artifact?.format === "installer" ? artifact : null, npm, pythonRuntime, pythonPackages, pythonSupplemental, electronRuntime: electron, binaries,
    licenseUnknown: unknown,
    licenseFiles: [...licenseCopies.values()].sort((a, b) => a.source.localeCompare(b.source, "en")),
  };
  const lines = [
    "MEFX-S3 Desktop 同梱ライセンス検査記録", "====================================", "",
    `パッケージ: ${desktop.name} ${desktop.version}`, `UTC生成日時: ${record.generatedAtUtc}`, "",
    "これはローカルで検出した表示と実本文の索引です。ライセンス識別子一覧だけではありません。",
    "licenses/ 以下のファイルは元データを改変せず保存しています。出典・SHA256は04_ビルド記録.jsonを参照。",
    "開発専用npm依存は除外。本番のdependencies/optionalDependencies/インストール済みpeerDependenciesを実パス解決します。",
    "Electron/Chromiumランタイムは別記。Pythonは配置済みdist-info（vendored分を含む）を列挙します。",
    "現在ソースと既存インストーラー・releaseの一致、個別の配布条件や対応ソースの網羅性は保証しません。", "",
  ];
  const append = (title, label, files) => {
    lines.push(title, `  ライセンス表示: ${label || "不明（未記載）"}`);
    lines.push(...(files.length ? files.map((entry) => `  本文: ${entry.saved} / 元: ${entry.source}`) : ["  本文: 未検出"]), "");
  };
  for (const [project, inventory] of Object.entries(npm)) {
    lines.push(`npm 本番依存: ${project}`, "------------------------");
    for (const pkg of inventory.packages) append(`${pkg.name}@${pkg.version}`, pkg.license, pkg.licenseFiles);
  }
  lines.push("Pythonパッケージ", "----------------");
  for (const pkg of pythonPackages) append(`${pkg.name}@${pkg.version}${pkg.vendored ? "（vendored）" : ""}`, pkg.licenseExpression || pkg.license, pkg.licenseFiles);
  append(`Python本体: ${pythonRuntime.version || "版不明"}`, "同梱LICENSE本文参照", pythonRuntime.licenseFiles);
  append("Python補足の第三者ライセンス", "各本文参照", pythonSupplemental);
  append(`Electron/Chromium: ${electron.version || "版不明"}`, electron.source, electron.licenseFiles);
  lines.push("ffmpeg / ffprobe 実バイナリ", "---------------------------", "npmラッパーの表示だけで実バイナリのライセンスを判断しないでください。", "");
  for (const item of binaries) {
    lines.push(item.name, `  実体: ${item.path || "未検出"}`, "  -version:", item.versionOutput || "未取得", "  -L:", item.licenseOutput || "未取得",
      "  ローカルREADME/package.json記載のURL（到達性・対応ソースは未検証）:", ...item.upstreamUrls.map((url) => `    ${url}`),
      `  対応ソース: ${item.sourceCorrespondence}`, "");
  }
  lines.push("未確定・配布前に確認する項目", "--------------------------", ...unknown.map((item) => `- ${item.component}: ${item.reason}`), "",
    "外部サイト・認証ファイル・.envは読みません。ライセンス未確定項目があっても記録は生成しますが、配布可とは判定しません。", "");

  // 既存配布物を消さず、新規ファイルだけ作成する。
  await mkdir(out, { recursive: true });
  const resolvedOut = await realpath(out);
  const licenseDir = path.join(out, "licenses");
  await mkdir(licenseDir, { recursive: true });
  if (!within(resolvedOut, await realpath(licenseDir))) throw new ManifestError("licenses/ が出力先外へリンクしているため中止しました。");
  for (const [saved, bytes] of pending) {
    const target = path.join(out, saved);
    if (await exists(target)) {
      if (!within(resolvedOut, await realpath(target))) throw new ManifestError("既存ライセンスが出力先外へリンクしているため中止しました。");
      if (digest(await readFile(target)) !== digest(bytes)) throw new ManifestError("既存のライセンスファイルとの衝突を検出しました。");
    } else await writeFile(target, bytes, { flag: "wx" });
  }
  await writeFile(noticePath, lines.join("\n"), { encoding: "utf8", flag: "wx" });
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`生成完了: ${out}\n本番npm: server ${npm.server.packages.length}件 / desktop ${npm["apps/desktop"].packages.length}件\nPython: ${pythonPackages.length}件 / 実ライセンス: ${licenseCopies.size}件 / 未確定: ${unknown.length}件`);
}

main().catch((error) => {
  // 入力由来の例外メッセージ・スタックには機密値が混ざり得るため表示しない。
  console.error(error instanceof ManifestError ? error.message : "生成できませんでした。依存配置・入出力先・入力の変更有無を確認してください（詳細例外は非表示）。");
  process.exitCode = 1;
});
