const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const runtime = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(runtime, 'playwright'));
const sharp = require(process.env.SHARP_MODULE || path.join(runtime, 'sharp'));
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'docs/hardware/generated/esp32-wiring-guide');
const url = pathToFileURL(path.join(root, 'docs/hardware/18_基板とESP32_画像配線ガイド.html')).href;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  let checks = 0;
  try {
    for (const [name, width, height] of [['desktop',1440,1100],['mobile',390,844]]) {
      const context = await browser.newContext({ viewport:{width,height}, deviceScaleFactor:1, offline:true });
      const page = await context.newPage();
      page.on('pageerror', (e)=>failures.push(e.message));
      page.on('console', (msg)=>{if(msg.type()==='error')failures.push(msg.text());});
      await page.goto(url);
      await page.waitForFunction(()=>Boolean(window.MEFX_GUIDE));
      assert.equal(await page.locator('[role="tab"]').count(),4); checks++;
      const model = await page.evaluate(()=>window.MEFX_GUIDE.data);
      const sha = crypto.createHash('sha256').update(await fs.readFile(path.join(root,model.source))).digest('hex');
      assert.equal(model.pcbSha256,sha);checks++;
      assert.equal(model.signals.length,9);checks++;
      assert.equal(model.pads.find((p)=>p.ref==='U3'&&p.number==='20').net,'');checks++;
      assert(await page.evaluate(()=>new Promise((resolve)=>{const image=new Image();image.onload=()=>resolve(true);image.onerror=()=>resolve(false);image.src='generated/esp32-wiring-guide/board-photo.png';})));checks++;
      await page.screenshot({path:path.join(out,`${name}-photo.png`),fullPage:true});
      if(name==='desktop')await page.locator('#photo-view').screenshot({path:path.join(out,'01_実物写真と接続位置.png')});
      await page.getByRole('tab',{name:'穴と端子の対応'}).click();
      for(const s of model.signals){
        await page.locator(`#signal-list [data-signal="${s.id}"]`).click();
        assert((await page.locator('#connection-detail').textContent()).includes(`U3-${s.pad}`));
        assert.equal(await page.locator(`#signal-list [data-signal="${s.id}"]`).getAttribute('aria-pressed'),'true');checks+=2;
      }
      await page.getByRole('button',{name:'線でつなぐ',exact:true}).click();
      assert((await page.locator('#method-note').textContent()).includes('離して'));checks++;
      await page.locator('#signal-list [data-signal="mclk"]').click();
      await page.screenshot({path:path.join(out,`${name}-pins.png`),fullPage:true});
      if(name==='desktop'){
        await page.setViewportSize({width:1920,height:1400});
        await page.locator('#panel-pins').screenshot({path:path.join(out,'02_基板穴とESP32端子.png')});
        await page.setViewportSize({width,height});
      }
      await page.getByRole('tab',{name:'周辺の配線'}).click();
      for(const ref of ['U5','J1','J2','J5','J4','J3']){
        await page.locator('#external-select').selectOption(ref);
        assert((await page.locator('#external-detail').textContent()).includes(`${ref}-1`));checks++;
      }
      await page.locator('#external-select').selectOption('U5');
      await page.screenshot({path:path.join(out,`${name}-external.png`),fullPage:true});
      await page.getByRole('tab',{name:'3D取り付け'}).click();
      await page.waitForFunction(()=>Boolean(window.MEFX_GUIDE.scene));
      await page.waitForTimeout(350);
      const stats=await page.evaluate(()=>{
        const r=window.MEFX_GUIDE.scene.renderer, gl=r.getContext();
        r.render(window.MEFX_GUIDE.scene.scene,window.MEFX_GUIDE.scene.camera);
        const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
        const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        let green=0,red=0,other=0;
        for(let i=0;i<pixels.length;i+=4){const[a,b,c]=pixels.slice(i,i+3);if(b>a*1.25&&b>c*1.1)green++;if(a>b*1.25&&a>c*1.1)red++;if(Math.abs(a-238)+Math.abs(b-243)+Math.abs(c-240)>30)other++;}
        return{w,h,green,red,other};
      });
      assert(stats.other>1000,`${name}: blank canvas`);assert(stats.green>200,`${name}: PCB not visible`);assert(stats.red>50,`${name}: ESP32 not visible`);checks+=3;
      const before=await page.locator('#three-view canvas').screenshot();
      await page.locator('#explode').fill('0');
      await page.locator('#explode').dispatchEvent('input');
      assert.equal(await page.locator('#explode-value').textContent(),'0 mm');checks++;
      const after=await page.locator('#three-view canvas').screenshot();
      assert.notEqual(crypto.createHash('sha256').update(before).digest('hex'),crypto.createHash('sha256').update(after).digest('hex'));checks++;
      await page.locator('#explode').fill('18');await page.locator('#explode').dispatchEvent('input');
      await page.getByRole('button',{name:'真上',exact:true}).click();
      assert((await page.evaluate(()=>window.MEFX_GUIDE.scene.camera.position.y))>120);checks++;
      await page.getByRole('button',{name:'斜め',exact:true}).click();
      const box=await page.locator('#three-view').boundingBox();
      const cameraBefore=await page.evaluate(()=>window.MEFX_GUIDE.scene.camera.position.toArray());
      await page.mouse.move(box.x+box.width*.4,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.6,{steps:12});await page.mouse.up();await page.waitForTimeout(200);
      const cameraAfter=await page.evaluate(()=>window.MEFX_GUIDE.scene.camera.position.toArray());
      assert.notDeepEqual(cameraBefore,cameraAfter);checks++;
      await page.getByRole('button',{name:'表示を元に戻す',exact:true}).click();
      const framed=await page.evaluate(()=>{
        const model=window.MEFX_GUIDE.scene;
        const projected=[];
        for(const x of [-75,75])for(const y of [-1.6,0])for(const z of [-45,45]){
          const p=model.controls.target.clone().set(x,y,z).project(model.camera);projected.push([p.x,p.y]);
        }
        return projected.every(([x,y])=>Math.abs(x)<.98&&Math.abs(y)<.98);
      });assert(framed,`${name}: PCB extends beyond canvas`);checks++;
      await page.screenshot({path:path.join(out,`${name}-three.png`),fullPage:true});
      if(name==='desktop')await page.locator('#three-view').screenshot({path:path.join(out,'03_3D取り付け図.png')});
      for(const tab of ['実物写真','穴と端子の対応','3D取り付け','周辺の配線']){
        await page.getByRole('tab',{name:tab,exact:true}).click();
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
        assert(!overflow,`${name}: horizontal overflow on ${tab}`);checks++;
      }
      if(name==='mobile'){
        await page.setViewportSize({width:320,height:720});
        for(const tab of ['実物写真','穴と端子の対応','3D取り付け','周辺の配線']){
          await page.getByRole('tab',{name:tab,exact:true}).click();
          assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)),`320px overflow: ${tab}`);checks++;
        }
        await page.getByRole('tab',{name:'穴と端子の対応'}).click();
        assert(await page.locator('#pin-closeup').isVisible());checks++;
        await page.screenshot({path:path.join(out,'mobile-320-pins.png'),fullPage:true});
      }
      console.log(name,stats);
      await context.close();
    }
    assert.deepEqual(failures,[]);checks++;
    for(const file of ['01_実物写真と接続位置.png','02_基板穴とESP32端子.png','03_3D取り付け図.png']){
      const metadata=await sharp(path.join(out,file)).metadata();assert(metadata.width>600&&metadata.height>200);checks++;
    }
    console.log(`PASS: ${checks} checks; offline file URL, 9 connections, desktop/mobile, 3D pixels/controls, PNG export`);
  } finally {await browser.close();}
})().catch((error)=>{console.error(error);process.exitCode=1;});
