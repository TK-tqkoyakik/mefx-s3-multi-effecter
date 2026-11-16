import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = process.argv[2];
if (!python) throw new Error("Usage: node scripts/lock-desktop-python.mjs PATH_TO_PYTHON");
const packages = path.join(root, "tools/python-packages");
const archives = path.join(root, "tools/01_python_archives");
await fs.mkdir(archives, { recursive: true });
const pins = new Map();
for (const entry of await fs.readdir(packages)) {
  if (!entry.endsWith(".dist-info")) continue;
  const metadata = await fs.readFile(path.join(packages, entry, "METADATA"), "utf8");
  const name = /^Name: (.+)$/m.exec(metadata)?.[1]?.trim();
  const version = /^Version: (.+)$/m.exec(metadata)?.[1]?.trim();
  if (!name || !version || !/^[a-zA-Z0-9_.-]+$/.test(name) || !/^[\w.+-]+$/.test(version)) throw new Error(`Invalid metadata: ${entry}`);
  pins.set(name.toLowerCase().replace(/[-_.]+/g, "-"), version);
}
pins.set("wheel", "0.45.1");
pins.set("packaging", "26.0");
pins.set("pip", "26.2.1");
const header = "--index-url https://pypi.org/simple\n--extra-index-url https://download.pytorch.org/whl/cpu\n";
const input = path.join(archives, "01_pins.txt");
await fs.writeFile(input, header + [...pins].sort().map(([name, version]) => `${name}==${version}`).join("\n") + "\n");
const downloaded = spawnSync(python, ["-m", "pip", "--isolated", "download", "--no-deps", "--no-build-isolation", "--dest", archives, "-r", input], { stdio: "inherit", windowsHide: true });
if (downloaded.status !== 0) throw new Error("Pinned archive download failed; the existing bundle was not changed.");
const records = [];
const hashes = new Map();
const buildOnly = new Set(["pip", "wheel", "packaging"]);
for (const filename of await fs.readdir(archives)) {
  if (!/\.(?:whl|tar\.gz|zip)$/.test(filename)) continue;
  const bytes = await fs.readFile(path.join(archives, filename));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const lower = filename.toLowerCase().replace(/_/g, "-");
  const match = [...pins].find(([name, version]) => lower.startsWith(`${name}-${version.toLowerCase()}-`) || lower === `${name}-${version.toLowerCase()}.tar.gz` || lower === `${name}-${version.toLowerCase()}.zip`);
  if (!match) throw new Error(`Unrecognized archive: ${filename}`);
  const [name, version] = match;
  if (hashes.has(name)) throw new Error(`Multiple archives for ${name}; use a fresh numbered archive directory.`);
  hashes.set(name, sha256);
  records.push({ name, version, role: buildOnly.has(name) ? "build" : "runtime", filename, sha256, bytes: bytes.length });
}
if (hashes.size !== pins.size) throw new Error("Not every pinned package has an archive.");
const lock = "# Windows x64 / CPython 3.12.13. Generated from the tested bundle.\n" + header +
  [...pins].filter(([name]) => !buildOnly.has(name)).sort().map(([name, version]) => `${name}==${version} --hash=sha256:${hashes.get(name)}`).join("\n") + "\n";
await fs.writeFile(path.join(root, "scripts/desktop-analysis-requirements.lock.txt"), lock);
await fs.writeFile(path.join(root, "scripts/desktop-python-build.lock.txt"), header +
  ["pip", "setuptools", "wheel", "packaging"].map((name) => `${name}==${pins.get(name)} --hash=sha256:${hashes.get(name)}`).join("\n") + "\n");
await fs.writeFile(path.join(root, "scripts/desktop-python-archives.json"), JSON.stringify({ python: "3.12.13", platform: "win_amd64", records }, null, 2) + "\n");
const modelPath = "hub/checkpoints/955717e8-8726e21a.th";
const model = await fs.readFile(path.join(root, "tools/torch-home", modelPath));
await fs.writeFile(path.join(root, "scripts/desktop-analysis-models.lock.json"), JSON.stringify({ model: "htdemucs", files: [{ path: modelPath, sha256: createHash("sha256").update(model).digest("hex") }] }, null, 2) + "\n");
console.log(`Locked ${pins.size} package archives with SHA-256.`);
