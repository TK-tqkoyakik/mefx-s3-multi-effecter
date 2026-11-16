import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(root, 'docs/hardware/wiring-viewer');
const output = path.join(root, 'docs/hardware/generated/esp32-wiring-guide');
await mkdir(output, { recursive: true });
await build({
  entryPoints: [path.join(source, 'scene.js')],
  bundle: true,
  format: 'iife',
  globalName: 'MEFX_WIRING_SCENE',
  outfile: path.join(output, 'scene.js'),
  minify: true,
  legalComments: 'eof',
  nodePaths: [fileURLToPath(new URL('node_modules', import.meta.url))],
});
for (const name of ['guide.js', 'style.css']) {
  await copyFile(path.join(source, name), path.join(output, name));
}
await copyFile(
  fileURLToPath(new URL('node_modules/three/LICENSE', import.meta.url)),
  path.join(output, 'THREE-LICENSE.txt'),
);
console.log(output);
