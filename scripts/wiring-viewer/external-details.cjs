// Physical orientation and measurement diagrams; terminal layouts remain unassigned
// until the user's actual jack/switch contacts have been continuity-tested.
module.exports = function extraDiagrams(data, {svg,txt,rect,dot,wire}) {
  const diagrams = [];
  const add = (name,title,body,height=820) => diagrams.push({name,title,body:svg(1045,height,body)});
  const center = (x,y,s,size=21,color='#202824') => txt(x,y,s,size,color,'text-anchor="middle"');
  const lead = (x,y,toX,toY,label,color='#333') => wire([[x,y],[toX,toY]],color)+dot(x,y,color,'')+txt(toX+8,toY,label,19,color);
  let b=txt(25,42,'R-78：印字面を手前、足を下にする',28)+txt(25,80,'R-78E5.0-1.0 専用。型番が違う場合は、この足順を使わない。',20);
  b+=rect(250,130,420,270,'#252c2b')+center(460,215,'RECOM',30,'white')+center(460,270,'R-78E5.0-1.0',28,'white')+center(460,320,'型番の印字が読める面',21,'white');
  b+=dot(310,365,'white','')+txt(700,355,'左のマーク側が1番',20)+wire([[310,365],[690,365]],'#777');
  for(const [i,x] of [310,460,610].entries()) {
    const color=['#bc3038','#333333','#a66a0a'][i];
    b+=rect(x-9,400,18,85,'#c4ccca')+wire([[x,485],[x,600]],color)+dot(x,485,color,String(i+1));
    b+=center(x,640,['1 / VIN','2 / GND','3 / VOUT'][i],24,color)+center(x,680,`基板 U5-${i+1}へ`,22,color);
  }
  b+=txt(25,735,'背面から見ると左右が逆になります。3本それぞれを絶縁してから固定。',20,'#923228');
  b+=txt(25,775,'RECOM仕様書 4ページの外形・ピン表に基づく模式図。現物の型番とマークも照合。',18);
  add('08_R78_足の向き.svg','R-78の向きと3本の足',b);

  b=txt(25,42,'電圧を測る場所：ESP32は外しておく',28)+txt(25,80,'部品面・USB左。黒はB、赤はAまたはC。赤と黒の先端を接触させない。',20);
  b+=rect(30,150,450,270,'#216f43');
  const pos=p=>[30+p.pos[0]*3,150+p.pos[1]*3];
  for(const p of data.pads) {const[x,y]=pos(p);b+=`<circle cx="${x}" cy="${y}" r="1.5" fill="#bed1c4"/>`;}
  const find=(ref,num,net)=>{const p=data.pads.find(p=>p.ref===ref&&p.number===num);if(!p||p.net!==net)throw Error(`Measurement point mismatch: ${ref}-${num}`);return p;};
  const a=find('U3','1','+5V'),g=find('U3','21','GND'),c=find('C7','1','+3V3_LOGIC');
  find('C7','2','GND');find('U4','5','+3V3_LOGIC');
  b+=lead(...pos(a),70,125,'A：U3-1 / 5V','#bc3038')+lead(...pos(g),55,460,'B：U3-21 / GND','#333');
  b+=lead(...pos(c),320,125,'C：C7左端','#7858a6')+txt(50,400,'ESP32を取り外した基板',19,'white');
  b+=rect(555,150,460,300,'#edf5ef')+txt(575,185,'C7周辺の拡大（同じ向き）',21);
  const zoom=p=>[590+(p.pos[0]-98)*42,235+(p.pos[1]-7)*42];
  for(const ref of ['U4','C7']) {
    const pads=data.pads.filter(p=>p.ref===ref);
    for(const p of pads) {const[x,y]=zoom(p);b+=rect(x-p.size[0]*15,y-p.size[1]*15,p.size[0]*30,p.size[1]*30,'#b9c4bf');}
    b+=ref==='U4'?rect(650,350,38,64,'#333'):rect(857,249,47,55,'#c2ad63');
  }
  b+=txt(646,435,'U4',19)+txt(866,230,'C7',21);
  b+=dot(...zoom(c),'#7858a6','C')+dot(...zoom(find('C7','2','GND')),'#333','');
  b+=txt(805,345,'左端＝3.3V',20,'#7858a6')+txt(805,375,'右端＝GND',20)+txt(575,482,'C7の両端をプローブで橋渡ししない。',19,'#923228');
  b+=txt(25,530,'A：赤 → U3-1（上列の左端）　約5V',23,'#bc3038')+txt(25,575,'B：黒 → U3-21（下列の左端）　共通GND',23)+txt(25,620,'C：赤 → C7の左端　　　　　　 約3.3V',23,'#7858a6');
  b+=txt(25,675,'先に電源OFFで黒プローブを固定。DC電圧モードにしてから9Vを接続。',20);
  b+=txt(25,715,'赤リードはV/Ω端子、黒はCOM。電流端子・電流モードでは測らない。',20,'#923228');
  b+=txt(25,755,'C7は小さいため、安定して当てられない場合は通電せず作業を止める。',20,'#923228');
  add('09_電圧測定点.svg','5V・3.3Vの測定場所',b);

  b=txt(25,42,'ジャックの端子を特定する：電源OFF・基板から外す',26);
  b+=txt(25,85,'音声：ケーブルの片端をジャックへ挿し、反対端のプラグで調べる。',20);
  b+=rect(60,140,160,50,'#333')+rect(220,150,220,30,'#c9d0cc')+`<path d="M440 150 L490 165 L440 180Z" fill="#c9d0cc"/><path d="M423 150 V180" stroke="#222" stroke-width="6"/>`;
  b+=lead(300,170,85,240,'SLEEVE：金属の長い部分')+lead(467,165,480,310,'TIP：金属の先端','#176bc0');
  b+=txt(60,125,'露出している反対端のTSプラグ',20)+txt(60,325,'黒いグリップ部分には当てない。',19,'#923228');
  b+=rect(700,130,300,200,'#f3f7f4')+txt(715,165,'ジャック側の候補端子',20);
  for(const [i,y] of [205,250,295].entries())b+=dot(750,y,'#555','')+txt(775,y+6,`候補 ${['a','b','c'][i]}`,19);
  b+=wire([[467,165],[540,165],[540,205],[750,205]],'#176bc0')+txt(540,245,'導通測定',19)+txt(540,275,'1本ずつ',19);
  b+=txt(25,370,'TIPと導通 → J2-1 / J5-1。SLEEVEと導通 → J2-2 / J5-2。',21);
  b+=txt(25,405,'候補a/b/cの位置は仮。端子の形・本数・並びから決めない。',19,'#923228');
  b+=txt(25,470,'DC：電源につながっていない適合プラグをジャックへ挿して調べる。',20);
  b+=`<circle cx="155" cy="575" r="47" fill="none" stroke="#bc3038" stroke-width="13"/><circle cx="155" cy="575" r="14" fill="#333"/>`;
  b+=lead(200,575,290,535,'外周金属 → 導通する端子をJ1-1へ','#bc3038')+lead(155,575,290,625,'中心接点 → 導通する端子をJ1-2へ');
  b+=txt(25,695,'アダプターのACプラグは抜く。導通測定は必ず無通電で行う。',20,'#923228');
  b+=txt(25,735,'予備の無通電プラグ等で接点を確実に測れない場合は、端子を推測しない。',19);
  b+=txt(25,775,'3本目などの切替接点は未使用。同じ接点が複数見つかる場合は型番で確認。',19);
  add('10_ジャック端子の特定.svg','ジャックの導通確認',b);

  b=txt(25,42,'4本足の押しボタン：使うのは2つの接点',28)+txt(25,80,'向きや対角線で決めず、基板につなぐ前にテスターで調べる。',20);
  b+=rect(330,130,360,280,'#e5eae7')+`<circle cx="510" cy="270" r="70" fill="#555"/>`;
  for(const [x,y,l] of [[300,180,'a'],[720,180,'b'],[300,360,'c'],[720,360,'d']])b+=dot(x,y,'#333',l)+center(x,y-25,`候補 ${l}`,21);
  b+=txt(25,470,'1. 任意の2本にプローブを当てる。',23)+txt(25,520,'2. 離した状態では導通しないことを確認。',23)+txt(25,570,'3. 押したときだけ導通する2本を採用。',23);
  b+=txt(25,630,'採用した一方 → J4-1、もう一方 → J4-2。極性はありません。',21);
  b+=txt(25,680,'押さなくても常に導通する組合せは使わない。残りの足は未接続。',20,'#923228');
  b+=txt(25,730,'a〜dは確認用の仮名。内部の接続や実物の足位置を表していません。',19);
  add('11_押しボタン端子の特定.svg','4本足ボタンの接点確認',b);
  return diagrams;
};
