const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'docs/hardware/generated/external-wiring');
(async () => {
  const browser = await chromium.launch({headless:true});
  const errors = [];
  let checks = 0;
  try {
    const context = await browser.newContext({offline:true, deviceScaleFactor:1});
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if(m.type() === 'error') errors.push(m.text()); });
    const manifest = JSON.parse(await fs.readFile(path.join(out,'connections.json'),'utf8'));
    assert.equal(manifest.pcbSha256,crypto.createHash('sha256').update(await fs.readFile(path.join(root,'docs/kicad/mefx_s3.kicad_pcb'))).digest('hex')); checks++;
    assert.equal(manifest.connections.reduce((sum,c)=>sum+c.nets.length,0),13); checks++;
    const files = (await fs.readdir(out)).filter(f=>f.endsWith('.svg')).sort();
    assert.equal(files.length,11); checks++;
    for (const file of files) {
      await page.goto(pathToFileURL(path.join(out,file)).href);
      const size = await page.locator('svg').evaluate(n=>({width:n.viewBox.baseVal.width,height:n.viewBox.baseVal.height}));
      await page.setViewportSize(size);
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('parsererror').count(),0); checks++;
      const outside = await page.locator('text').evaluateAll(nodes=>nodes.filter(n=>{
        const b=n.getBBox(),v=n.ownerSVGElement.viewBox.baseVal;
        return b.x<0 || b.y<0 || b.x+b.width>v.width || b.y+b.height>v.height;
      }).map(n=>n.textContent));
      assert.deepEqual(outside,[],file); checks++;
      const collisions = await page.locator('text').evaluateAll(nodes=>{
        const result=[];
        for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++) {
          const a=nodes[i].getBBox(),b=nodes[j].getBBox();
          if(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>2 && Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>2)result.push([nodes[i].textContent,nodes[j].textContent]);
        }
        return result;
      });
      assert.deepEqual(collisions,[],file+' overlapping labels'); checks++;
      await page.screenshot({path:path.join(out,file.replace('.svg','.png'))});
    }
    for (const width of [1440,390,320]) {
      await page.setViewportSize({width,height:900});
      await page.goto(pathToFileURL(path.join(root,'docs/hardware/19_外付け端子の配線図.html')).href);
      assert.equal(await page.locator('img').count(),11); checks++;
      assert(await page.locator('img').evaluateAll(nodes=>nodes.every(n=>n.complete && n.naturalWidth>0))); checks++;
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)); checks++;
      for(const c of manifest.connections) { assert.equal(await page.locator(`#${c.ref}`).count(),1); checks++; }
      for(const c of manifest.connections) for(const [i,net] of c.nets.entries()) {
        const row=page.locator(`[data-wire="${c.ref}-${i+1}"]`);
        assert((await row.textContent()).includes(net));
        assert((await row.textContent()).includes(c.to[i]));
        assert(await row.evaluate(n=>[n,...n.querySelectorAll('*')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && e.scrollWidth<=e.clientWidth+1;})));
        checks+=3;
      }
      for(const id of ['before-power','measure','08','10','11']) {assert.equal(await page.locator(`[id="${id}"]`).count(),1);checks++;}
      const safety=await page.locator('#before-power').textContent();
      assert(safety.includes('短絡') && safety.includes('ほぼ0Ω') && safety.includes('USB・9V'));checks++;
      assert((await page.locator('#measure').textContent()).includes('電流端子・電流モードを使わない'));checks++;
      assert(await page.evaluate(()=>document.querySelector('#before-power').compareDocumentPosition(document.querySelector('#measure'))&Node.DOCUMENT_POSITION_FOLLOWING));checks++;
      await page.screenshot({path:path.join(out,`preview-${width}.png`),fullPage:true});
      await page.locator('#J2').screenshot({path:path.join(out,`input-${width}.png`)});
    }
    assert.deepEqual(errors,[]); checks++;
    await fs.writeFile(path.join(out,'検証記録.txt'),`PASS: ${checks} checks\nPCB hash; offline SVG/HTML rendering; 13 readable wire mappings; 11 diagrams; text bounds; 1440/390/320px layouts; pre-power checks and measurement guidance.\nActual electrical assembly and operation NOT tested.\n`);
    console.log(`PASS: ${checks} checks; 11 PNG diagrams rendered.`);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
