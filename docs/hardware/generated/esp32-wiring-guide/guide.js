(() => {
  'use strict';
  const data = window.MEFX_WIRING_DATA;
  const asset = 'generated/esp32-wiring-guide/';
  const byId = (id) => document.getElementById(id);
  const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let selected = data.signals[0];
  let method = 'socket';
  let scene;
  const svg = (w, h, content, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" class="svg-label">${content}</svg>`;
  const text = (x, y, value, size = 16, fill = '#202624', extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;
  const pad = (x, y, rect, color, r = 6) => rect
    ? `<rect x="${x-r}" y="${y-r}" width="${r*2}" height="${r*2}" rx="1" fill="${color}" stroke="#fff" stroke-width="1.3"/><circle cx="${x}" cy="${y}" r="${r*.37}" fill="#162e24"/>`
    : `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="#fff" stroke-width="1.3"/><circle cx="${x}" cy="${y}" r="${r*.37}" fill="#162e24"/>`;

  function setTab(name) {
    for (const key of ['photo', 'pins', 'three', 'external']) {
      byId(`tab-${key}`).setAttribute('aria-selected', String(name === key));
      byId(`panel-${key}`).hidden = name !== key;
    }
    if (name === 'three' && !scene) {
      try {
        scene = window.MEFX_WIRING_SCENE.init(byId('three-view'), data);
        scene.select(selected.pad);
      } catch (error) {
        byId('three-status').textContent = '3Dを表示できません。穴と端子の対応図をご利用ください。';
        byId('three-status').setAttribute('role', 'alert');
        console.error(error);
      }
    }
    scene?.resize();
  }

  const photoLabels = [
    [220, 250, 225, 90, 'U3 / ESP32', '#176bc0'],
    [598, 224, 575, 126, 'J1 / 9V入力', '#bc3038'],
    [715, 224, 790, 120, 'U5 / R-78からの3本をつなぐ穴', '#a56213'],
    [97, 510, 190, 453, 'J2 / INPUT', '#176bc0'],
    [78, 692, 198, 756, 'J3 / MIC', '#197b58'],
    [850, 790, 842, 898, 'J4 / ボタン', '#7d6b16'],
    [1148, 522, 1100, 590, 'J5 / OUTPUT', '#176bc0'],
  ];
  byId('photo-view').innerHTML = svg(1280, 960,
    `<image href="${asset}${data.photo}" width="1280" height="960"/>` + photoLabels.map(([x,y,lx,ly,label,color]) => {
      const width = label.length * 15 + 30;
      return `<path d="M${x} ${y} L${lx} ${ly+16}" stroke="#fff" stroke-width="7" fill="none"/><path d="M${x} ${y} L${lx} ${ly+16}" stroke="${color}" stroke-width="3" fill="none"/><circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#fff" stroke-width="4"/><circle cx="${x}" cy="${y}" r="11" fill="none" stroke="${color}" stroke-width="3"/><rect x="${lx-width/2}" y="${ly-22}" width="${width}" height="43" rx="5" fill="#fff" stroke="${color}" stroke-width="2"/>${text(lx,ly+7,label,23,color,'text-anchor="middle" font-weight="700"')}`;
    }).join(''), '提供された実物写真。USB左、アンテナ右。J1とU5の未装着位置、入出力ジャックの接続位置');

  function selectSignal(id) {
    selected = data.signals.find((s) => s.id === id) || selected;
    drawPins();
    byId('connection-detail').innerHTML = `<h3><span style="color:${selected.color}">●</span> ${esc(selected.title)}</h3><div class="endpoint"><small>基板側の穴</small><b>U3-${selected.pad}</b><span>${selected.row}・左から${selected.ordinal}穴目</span><br><code>${selected.net}</code></div><div class="endpoint"><small>ESP32の印字</small><b>${selected.label.match(/^\d+$/) ? 'GPIO ' : ''}${selected.label}</b><span>${selected.pad <= 20 ? '上列' : '下列'}・左から${selected.ordinal}端子目</span></div><p class="direction">${esc(selected.direction)}</p><p class="note">${esc(selected.note)}</p>`;
    for (const button of byId('signal-list').querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.signal === selected.id));
    }
    scene?.select(selected.pad);
  }

  function drawPins() {
    const w = 940;
    const start = 93;
    const pitch = 39;
    const topA = 100, bottomA = 192, topB = 366, bottomB = 458;
    let shapes = `<rect x="35" y="60" width="870" height="169" rx="4" fill="#edf5ef" stroke="#c2d4c7"/>${text(49,44,'基板 U3 / ESP32を外したときの穴',21,'#202624','font-weight="700"')}<rect x="35" y="326" width="870" height="169" rx="4" fill="#fff0f0" stroke="#e0bcbc"/>${text(49,310,'ESP32 / 赤い基板の端子印字',21,'#202624','font-weight="700"')}`;
    shapes += `<path d="M40 120 L17 120 L17 170 L40 170 M40 386 L17 386 L17 436 L40 436" stroke="#303833" stroke-width="4" fill="#d3d9d6"/>${text(5,253,'USBは左',17,'#202624')}${text(792,253,'アンテナは右',17,'#202624')}`;
    for (const [row, labels] of data.rows.entries()) {
      for (const [i, label] of labels.entries()) {
        const n = row * 20 + i + 1;
        const signal = data.signals.find((s) => s.pad === n);
        const active = n === selected.pad;
        const x = start + i * pitch;
        const y1 = row ? bottomA : topA;
        const y2 = row ? bottomB : topB;
        const color = signal ? signal.color : '#9baaa0';
        if (active) {
          shapes += `<path d="M${x} ${y1+10} C${x-10} ${y1+62},${x-10} ${y2-62},${x} ${y2-10}" fill="none" stroke="${color}" stroke-width="4" ${method==='socket'?'stroke-dasharray="7 5"':''}/>`;
        }
        shapes += `<g class="map-pad" ${signal ? `role="button" tabindex="0" data-signal="${signal.id}" aria-label="U3-${n} ${esc(signal.net)}、ESP32 ${esc(label)}"` : ''}><rect x="${x-18}" y="${y1-21}" width="36" height="42" fill="transparent" class="focus-ring"/>${pad(x,y1,i===0,color,active?10:7)}${text(x,y1+(row?30:-18),n,active?19:14,active?color:'#617468','text-anchor="middle"')}${pad(x,y2,i===0,color,active?10:7)}${text(x,y2+(row?31:-20),label,active?21:15,active?color:'#5b6860',`text-anchor="middle" ${active?'font-weight="700"':''}`)}</g>`;
      }
    }
    byId('pin-map').innerHTML = svg(w, 530, shapes, `上が基板穴、下がESP32端子。同じ向き。選択中 U3-${selected.pad} から ESP32 ${selected.label}`);
    const row = selected.pad <= 20 ? 0 : 1;
    const first = Math.max(0, Math.min(17, selected.ordinal - 2));
    let closeup = text(16,24,'選択した1本と、左右の端子を拡大',15,'#202624','font-weight="700"');
    closeup += `<rect x="10" y="40" width="320" height="85" rx="3" fill="#edf5ef"/><rect x="10" y="190" width="320" height="85" rx="3" fill="#fff0f0"/>${text(18,59,`基板 U3 / ${selected.row}`,14)}${text(18,209,`ESP32 / ${selected.row}`,14)}`;
    const activeX=63+(selected.ordinal-1-first)*106;
    closeup += `<path d="M${activeX} 113 L${activeX} 218" stroke="${selected.color}" stroke-width="3" ${method==='socket'?'stroke-dasharray="5 4"':''}/>`;
    for(let i=0;i<3;i++){
      const n=row*20+first+i+1,x=63+i*106,active=n===selected.pad;
      const signal=data.signals.find((s)=>s.pad===n),color=signal?.color||'#9baaa0';
      closeup += text(x,81,`U3-${n}`,active?17:14,color,`text-anchor="middle" ${active?'font-weight="700"':''}`)+pad(x,104,(n-1)%20===0,color,active?10:7)+pad(x,228,(n-1)%20===0,color,active?10:7)+text(x,261,data.rows[row][first+i],active?21:16,color,`text-anchor="middle" ${active?'font-weight="700"':''}`);
    }
    byId('pin-closeup').innerHTML=svg(340,290,closeup,`拡大。${selected.row} U3-${selected.pad} から ESP32 ${selected.label}。左右も同じ並びです。`);
    for (const node of byId('pin-map').querySelectorAll('[data-signal]')) {
      node.addEventListener('click', () => selectSignal(node.dataset.signal));
      node.addEventListener('keydown', (event) => { if (event.key==='Enter'||event.key===' ') { event.preventDefault(); selectSignal(node.dataset.signal); } });
    }
  }

  byId('signal-list').innerHTML = data.signals.map((s) => `<button type="button" data-signal="${s.id}" aria-pressed="false"><strong><i class="dot" style="background:${s.color}"></i>${s.label.match(/^\d+$/)?'GPIO ':''}${s.label}</strong><small>U3-${s.pad} / ${s.net}</small></button>`).join('');
  for (const button of byId('signal-list').querySelectorAll('button')) button.addEventListener('click', () => selectSignal(button.dataset.signal));
  for (const key of ['socket', 'wire']) byId(`method-${key}`).addEventListener('click', () => {
    method = key;
    for (const k of ['socket','wire']) byId(`method-${k}`).setAttribute('aria-pressed', String(k===key));
    byId('method-note').textContent = key==='socket'
      ? '上下の図を分けて表示していますが、実際はESP32をU3の真上に載せます。上下を反転していません。'
      : 'ESP32を離して固定する場合だけの配線図です。選んだ1本を強調します。電源OFFで作業し、信号線は短くしてください。';
    drawPins();
  });

  const external = {
    U5: { title:'R-78E5.0-1.0', rows:[['U5-1 / +9V_PROT','R-78 Pin 1 / VIN'],['U5-2 / GND','R-78 Pin 2 / GND'],['U5-3 / +5V','R-78 Pin 3 / VOUT']], note:'R-78は印字面を正面・足を下にして、左から1・2・3。基板U5の左端の四角穴が1番。今回は基板に挿さず3本の短い線で接続し、足を個別に絶縁して本体を固定。配線図19の足の向きと照合する。', colors:['#bc3038','#333333','#ad6c13'] },
    J1: { title:'9V DCジャック', rows:[['J1-1 / +9V_RAW','プラグ外周と導通する端子'],['J1-2 / GND','プラグ中心と導通する端子']], note:'センターマイナス。ジャックの端子配置は現物次第です。電源から外したプラグを挿し、テスターで対応を決めます。3本目のスイッチ端子は使いません。', colors:['#bc3038','#333333'] },
    J2: { title:'INPUTジャック', rows:[['J2-1 / INPUT_TIP','TIP / プラグ先端'],['J2-2 / GND','SLEEVE / プラグ根元']], note:'ジャックのハンダ端子の左右では判断しません。未通電のプラグを挿して導通確認。', colors:['#176bc0','#333333'] },
    J5: { title:'OUTPUTジャック', rows:[['J5-1 / OUTPUT_TIP','TIP / プラグ先端'],['J5-2 / GND','SLEEVE / プラグ根元']], note:'J5につないだジャックが出力です。ケースの左右では決めません。', colors:['#176bc0','#333333'] },
    J4: { title:'4本足の仮押しボタン', rows:[['J4-1 / FOOTSW_GPIO','押したときだけつながる接点A'],['J4-2 / GND','同じ接点の反対側B']], note:'極性なし。4本のうち、未押下では導通せず、押下時だけ導通する2本をテスターで選びます。外見だけで対角や隣同士と決めません。', colors:['#7d6b16','#333333'] },
    J3: { title:'マイク / 初回は不要', rows:[['J3-1 / MIC_BIAS','エレクトレットマイク＋'],['J3-2 / GND','マイク−']], note:'マイクは電源と音声入出力が確認できてから。現物の極性表示・仕様書を優先します。', colors:['#197b58','#333333'] },
  };
  function drawBoard(ref) {
    const chosen = external[ref];
    let geometry = '<rect x="0" y="0" width="150" height="90" rx=".4" fill="#216f43"/>';
    for (const t of data.tracks) geometry += `<path d="M${t.start.join(' ')} L${t.end.join(' ')}" stroke="#338151" stroke-width="${Math.max(.18,t.width)}" fill="none"/>`;
    for (const p of data.pads) {
      const color = p.ref===ref ? chosen.colors[Number(p.number)-1] : '#b8c7be';
      const [x,y]=p.pos;
      if(p.drill[0]){
        const radius=Math.max(...p.size)/2;
        geometry+=p.rect?`<rect x="${x-radius}" y="${y-radius}" width="${radius*2}" height="${radius*2}" fill="${color}"/>`:`<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}"/>`;
        geometry+=`<circle cx="${x}" cy="${y}" r="${p.drill[0]/2}" fill="#132b20"/>`;
      }else geometry+=`<rect x="${x-p.size[0]/2}" y="${y-p.size[1]/2}" width="${p.size[0]}" height="${p.size[1]}" transform="rotate(${-p.rotation} ${x} ${y})" fill="#c5ceca"/>`;
    }
    for(const part of data.parts.filter((p)=>['U1','U2','U4','D1'].includes(p.ref))){
      const [w,h]=part.ref==='U1'?[3.9,4.9]:part.ref==='U2'?[4.4,7.8]:part.ref==='U4'?[1.6,2.9]:[4.3,2.6];
      geometry+=`<rect x="${part.pos[0]-w/2}" y="${part.pos[1]-h/2}" width="${w}" height="${h}" fill="#272e2b"/>`;
    }
    geometry += `<rect x=".5" y="3.7" width="57" height="28" fill="#cf3a45" opacity=".7"/>${text(5,20,'ESP32 / USB左',3.2,'#fff')}`;
    for (const p of data.parts.filter((p)=>p.ref===ref)) geometry += `<rect x="${p.pos[0]-2}" y="${p.pos[1]-2}" width="${ref==='U5'?9:7}" height="4" fill="none" stroke="#fff" stroke-width=".5"/>`;
    const labels = {U5:[84,2],J1:[68,4],J2:[8,43],J3:[8,65],J4:[98,77],J5:[134,44]};
    for (const [name,[x,y]] of Object.entries(labels)) geometry += text(x,y,name,3.4,'#fff','font-weight="700"');
    const focus = data.pads.filter((p)=>p.ref===ref);
    const startX = ref==='U5'?125:155;
    const y = 690;
    let detail = `<rect x="18" y="615" width="930" height="174" rx="5" fill="#edf5ef"/>${text(38,645,`${ref}の穴を拡大 / 左右は上の図と同じ`,22,'#202624','font-weight="700"')}`;
    focus.forEach((p,i) => { const x=startX+i*160; detail += pad(x,y,p.rect,chosen.colors[i],20)+text(x,y-30,`Pad ${p.number}`,20,'#202624','text-anchor="middle"')+text(x,y+48,p.net,20,'#202624','text-anchor="middle"'); });
    byId('board-map').innerHTML = svg(980,810,`<g transform="translate(38,12) scale(6)">${geometry}</g>${detail}`,`基板部品面。${ref}の接続位置と拡大図`);
    byId('external-detail').innerHTML = `<h3>${chosen.title}</h3><table><thead><tr><th>基板の穴</th><th>部品側</th></tr></thead><tbody>${chosen.rows.map(([a,b])=>`<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table><p class="caution">${esc(chosen.note)}</p>`;
  }
  byId('external-select').addEventListener('change', (e)=>drawBoard(e.target.value));
  for (const key of ['photo','pins','three','external']) byId(`tab-${key}`).addEventListener('click',()=>setTab(key));
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  tabs.forEach((tab,i)=>tab.addEventListener('keydown',(e)=>{ if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return; e.preventDefault(); const index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length; tabs[index].click();tabs[index].focus(); }));
  byId('go-pins').addEventListener('click',()=>setTab('pins'));
  byId('print').addEventListener('click',()=>window.print());
  byId('explode').addEventListener('input',(e)=>{byId('explode-value').textContent=`${e.target.value} mm`;scene?.explode(Number(e.target.value));});
  for (const [id, view] of [['top-view','top'],['oblique-view','oblique'],['reset-view','reset']]) byId(id).addEventListener('click',()=>scene?.view(view));
  byId('pcb-hash').textContent=`PCB SHA-256: ${data.pcbSha256}`;
  selectSignal('power');
  drawBoard('U5');
  window.MEFX_GUIDE = { data, setTab, selectSignal, get scene(){return scene;} };
})();
