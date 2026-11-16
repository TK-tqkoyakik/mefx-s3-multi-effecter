// Generate assembly diagrams from the verified KiCad geometry, not guessed hole locations.
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const out = path.join(root,'docs/hardware/generated/external-wiring');
const h = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const txt = (x,y,s,size=22,color='#202824',extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${h(s)}</text>`;
const rect = (x,y,w,ht,fill,stroke='#c6d3cb')=>`<rect x="${x}" y="${y}" width="${w}" height="${ht}" rx="5" fill="${fill}" stroke="${stroke}"/>`;
const dot = (x,y,c,n,square=false,r=9)=>`${square?`<rect x="${x-r}" y="${y-r}" width="${r*2}" height="${r*2}" fill="${c}" stroke="white" stroke-width="2"/>`:`<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="white" stroke-width="2"/>`}${n?txt(x,y+5,n,13,'white','text-anchor="middle" font-weight="700"'):''}`;
const wire = (points,color)=>`<polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="white" stroke-width="8" stroke-linejoin="round"/><polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"/>`;
const svg=(w,ht,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}" font-family="Meiryo, Yu Gothic UI, sans-serif">${rect(0,0,w,ht,'white','white')}${body}</svg>`;
const spec = [
 {ref:'J2',title:'INPUT / 楽器から',device:'6.35mm TS モノラルジャック',flow:'ギター・ベース → シールドケーブル → INPUT',nets:['INPUT_TIP','GND'],to:['TIP：プラグの先端と導通','SLEEVE：プラグの根元と導通'],colors:['#176bc0','#333333'],notes:['プラグをジャックに挿し、電源OFFで導通を調べる。','ジャックの端子を左右や長さだけで決めない。']},
 {ref:'J5',title:'OUTPUT / アンプへ',device:'6.35mm TS モノラルジャック',flow:'OUTPUT → シールドケーブル → アンプのINPUT',nets:['OUTPUT_TIP','GND'],to:['TIP：プラグの先端と導通','SLEEVE：プラグの根元と導通'],colors:['#176bc0','#333333'],notes:['アンプのスピーカー出力にはつながない。','ヘッドホン・スピーカーを直接駆動する出力ではない。']},
 {ref:'J1',title:'9V電源 / センターマイナス',device:'DCジャック（機能で端子を特定）',flow:'9V DCアダプター → DCジャック → J1',nets:['+9V_RAW','GND'],to:['プラグ外周と導通する端子（＋）','プラグ中心と導通する端子（−）'],colors:['#bc3038','#333333'],notes:['未通電のプラグを挿して、中心・外周との導通を確認。','3本目のスイッチ端子は未接続。USBと9Vは同時接続しない。']},
 {ref:'U5',title:'R-78 / 9Vから5Vへ',device:'RECOM R-78E5.0-1.0',flow:'R-78も基板へ挿さず、3本の線でつなぐ',nets:['+9V_PROT','GND','+5V'],to:['Pin 1 / VIN','Pin 2 / GND','Pin 3 / VOUT（5V）'],colors:['#bc3038','#333333','#a66a0a'],notes:['足ごとに熱収縮チューブ等で絶縁し、本体を固定する。','配線はできるだけ短く。延長による安定性・ノイズは実機確認。']},
 {ref:'J4',title:'押しボタン / エフェクト切替',device:'押した時だけONになる接点',flow:'J4の2本 → 押しボタンの接点A・B',nets:['FOOTSW_GPIO','GND'],to:['接点A（極性なし）','接点B（極性なし）'],colors:['#896e10','#333333'],notes:['4本足でも、未押下で非導通・押下時だけ導通する2本を使う。','常に導通する2本は不可。残り2本はつながない。']},
 {ref:'J3',title:'マイク / 後で接続',device:'2線式エレクトレットマイク',flow:'音出しの初回確認では未接続でよい',nets:['MIC_BIAS','GND'],to:['マイク ＋','マイク −'],colors:['#237b54','#333333'],notes:['現物の極性表示・仕様書を確認して接続。','ギターはJ3ではなく、J2のINPUTへつなぐ。']},
];
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const context={window:{}};vm.runInNewContext(await fs.readFile(path.join(root,'docs/hardware/generated/esp32-wiring-guide/wiring-data.js'),'utf8'),context);
 const data=context.window.MEFX_WIRING_DATA;
 const crypto=require('node:crypto');assert.equal(data.pcbSha256,crypto.createHash('sha256').update(await fs.readFile(path.join(root,data.source))).digest('hex'),'Regenerate verified geometry first');
 const getPads=ref=>data.pads.filter(p=>p.ref===ref).sort((a,b)=>+a.number-+b.number);
 for(const s of spec)assert.deepEqual(Array.from(getPads(s.ref),p=>p.net),s.nets);
 const coord=p=>[420+p.pos[0]*6,350+p.pos[1]*6];
 let overview=txt(45,50,'MEFX-S3 外付け配線図',34,'#202824','font-weight="700"')+txt(45,88,'ESP32だけソケットへ。外付け部品はすべて線でつなぐ。基板の部品面を上、USBを左。',23);
 overview+=rect(420,350,900,540,'#216f43','#216f43');
 for(const t of data.tracks)overview+=`<path d="M${420+t.start[0]*6} ${350+t.start[1]*6} L${420+t.end[0]*6} ${350+t.end[1]*6}" stroke="#388455" fill="none" stroke-width="1.1"/>`;
 for(const p of data.pads){const[x,y]=coord(p);overview+=`<circle cx="${x}" cy="${y}" r="${p.drill[0]?3.4:1.8}" fill="#bed1c4"/>`;}
 overview+=rect(423,372,342,168,'#b63944','#b63944')+rect(408,395,40,48,'#c7cccc')+rect(408,470,40,48,'#c7cccc')+txt(470,440,'ESP32',32,'white','font-weight="700"')+txt(470,482,'ここだけ直接挿す',22,'white')+txt(438,575,'USBはこちら ←',21,'white')+txt(870,740,'部品面 / 表',24,'white');
 const cards={J1:[580,120,330,130],U5:[1000,120,410,130],J2:[30,455,300,180],J5:[1450,455,320,180],J3:[30,795,300,180],J4:[800,980,390,130]};
 for(const s of spec){const[x,y,w,ht]=cards[s.ref];overview+=rect(x,y,w,ht,'#f3f7f4')+txt(x+18,y+(s.ref==='J4'?115:32),`${s.ref} / ${s.ref==='U5'?'R-78':s.ref==='J1'?'9V電源':s.ref==='J2'?'INPUT':s.ref==='J5'?'OUTPUT':s.ref==='J3'?'マイク（後で）':'押しボタン'}`,25,'#202824','font-weight="700"');}
 overview+=txt(47,530,'楽器のケーブルを挿す',20)+txt(47,565,'信号 / TIP',20,'#176bc0')+txt(47,605,'GND / SLEEVE',20);
 overview+=txt(1467,530,'ケーブルでアンプINPUTへ',20)+txt(1467,565,'信号 / TIP',20,'#176bc0')+txt(1467,605,'GND / SLEEVE',20);
 overview+=txt(600,190,'3本目の切替端子は未使用',19)+txt(640,233,'外周＋',20)+txt(790,233,'中心−',20);
 overview+=txt(1020,190,'足を絶縁・短い3本の線で接続',19);
 for(const [x,label] of [[1100,'1 VIN'],[1190,'2 GND'],[1280,'3 5V']])overview+=txt(x,233,label,20,'#202824','text-anchor="middle"');
 overview+=txt(48,885,'＋',24,'#237b54')+txt(48,930,'− / GND',23)+txt(820,1060,'押したときだけつながる2端子',20)+txt(900,1015,'A',22,'#202824','text-anchor="middle"')+txt(1110,1015,'B',22,'#202824','text-anchor="middle"');
 const routes={
  J1:[[[670,250],[670,300],[840,300]],[[820,250],[820,320],[855.24,320]]],
  U5:[[[1100,250],[1100,275],[924,275]],[[1190,250],[1190,295],[939.24,295]],[[1280,250],[1280,315],[954.48,315]]],
  J2:[[[330,560],[365,560],[365,638]],[[330,605],[390,605],[390,660],[483.24,660]]],
  J5:[[[1450,560],[1380,560],[1380,650]],[[1450,605],[1405,605],[1405,675],[1275.24,675]]],
  J3:[[[330,880],[350,880],[350,770]],[[330,930],[375,930],[375,795],[483.24,795]]],
  J4:[[[900,980],[900,930],[1020,930]],[[1110,980],[1110,950],[1035.24,950]]],
 };
 for(const s of spec){const pads=getPads(s.ref);pads.forEach((p,i)=>{const points=[...routes[s.ref][i],coord(p)];overview+=wire(points,s.colors[i])+dot(...points[0],s.colors[i],'')+dot(...points.at(-1),s.colors[i],String(i+1),p.rect,6.5);});const[x,y]=coord(pads[0]);overview+=txt(x+(s.ref==='J1'?-50:s.ref==='U5'?48:-12),y-18,s.ref,21,'white','font-weight="700"');}
 overview+=txt(45,1150,'線の色は識別用。丸・四角内の数字は基板の穴番号。外付け部品の端子は機能図であり、実物の端子配置ではありません。',20);
 await fs.writeFile(path.join(out,'01_全体配線図.svg'),svg(1800,1180,overview));
 const filenames=[];
 for(const [index,s]of spec.entries()){
  const pads=getPads(s.ref);let b=txt(25,42,`${s.ref}  ${s.title}`,28,'#202824','font-weight="700"')+txt(25,80,s.flow,20);
  b+=rect(25,115,240,270,'#edf5ef')+rect(560,115,460,270,'#f4f6f5')+txt(42,149,'基板側の穴',22)+txt(580,149,s.device,21);
  pads.forEach((p,i)=>{const y=208+i*70;b+=wire([[240,y],[585,y]],s.colors[i])+dot(240,y,s.colors[i],p.number,p.rect)+dot(585,y,s.colors[i],'')+txt(42,y-10,`${s.ref}-${p.number}`,22,'#202824','font-weight="700"')+txt(42,y+18,p.net,16)+txt(610,y+7,s.to[i],20);});
  b+=txt(26,423,'基板の穴の並び（部品面から。左右は全体図と同じ）',19);
  pads.forEach((p,i)=>b+=dot(60+i*105,460,s.colors[i],p.number,p.rect));
  if(s.ref==='J2'||s.ref==='J5'){
   b+=rect(565,434,145,35,'#333333')+rect(710,439,130,25,'#cad1ce')+`<path d="M840 439 L880 450 L840 464Z" fill="#cad1ce"/><path d="M819 439V464" stroke="#222" stroke-width="5"/>`+wire([[760,450],[760,490],[585,490]],'#333')+dot(760,450,'#333','')+txt(580,520,'長い金属部＝SLEEVE',18)+wire([[863,450],[920,485]],'#176bc0')+txt(840,520,'先端＝TIP',18);
  }else if(s.ref==='J1')b+=`<circle cx="750" cy="465" r="30" fill="none" stroke="#bc3038" stroke-width="9"/><circle cx="750" cy="465" r="9" fill="#333333"/>`+txt(590,523,'プラグ外周 ＋ ／ 中心 −',20);
  else if(s.ref==='U5')b+=txt(565,452,'印字面を手前、足を下。左から1・2・3。',18)+txt(565,484,'別図「R-78の向きと3本の足」で照合。',18);
  else if(s.ref==='J4')b+=`<circle cx="640" cy="460" r="7" fill="#333"/><circle cx="850" cy="460" r="7" fill="#333"/><path d="M640 460 L800 418" stroke="#333" stroke-width="4"/>`+txt(610,518,'離す：OFF ／ 押す：ON',20);
  b+=txt(25,566,s.notes[0],19,'#923228')+txt(25,600,s.notes[1],19,'#923228');
  const name=`${String(index+2).padStart(2,'0')}_${s.ref}_接続図.svg`;filenames.push(name);await fs.writeFile(path.join(out,name),svg(1045,625,b));
 }
 const extra=require('./external-details.cjs')(data,{svg,txt,rect,dot,wire});
 for(const d of extra)await fs.writeFile(path.join(out,d.name),d.body);
 const doc=require('./external-page.cjs')(spec,filenames,extra,h);
 await fs.writeFile(path.join(root,'docs/hardware/19_外付け端子の配線図.html'),doc);
 await fs.writeFile(path.join(out,'connections.json'),JSON.stringify({pcbSha256:data.pcbSha256,connections:spec},null,2));
 console.log('PASS: 13 external wires and measurement nets verified against PCB. Generated 11 diagrams.');
})();
