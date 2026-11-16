module.exports = function page(spec,filenames,extra,h) {
  const image = (name,alt) => `<a class="diagram-link" href="generated/external-wiring/${name}" aria-label="${h(alt)}を拡大"><img src="generated/external-wiring/${name}" alt="${h(alt)}"></a>`;
  const helpers = {U5:'08_R78_足の向き.svg',J2:'10_ジャック端子の特定.svg',J5:'10_ジャック端子の特定.svg',J1:'10_ジャック端子の特定.svg',J4:'11_押しボタン端子の特定.svg'};
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>MEFX-S3 外付け端子の配線図19</title>
<style>
*{box-sizing:border-box}body{font:16px/1.7 Meiryo,sans-serif;color:#202824;margin:0;background:white}main{max-width:1300px;margin:auto;padding:24px}h1{font-size:27px}h2{font-size:23px}h3{font-size:19px}img{display:block;width:100%;height:auto}a{color:#166949;overflow-wrap:anywhere}.warning{border-left:4px solid #ad3038;background:#fff1f1;padding:12px}nav{display:flex;flex-wrap:wrap;gap:16px;margin:22px 0}section{border-top:1px solid #ccd5cf;margin-top:30px;padding-top:16px}.caption{font-size:14px;color:#5c6860}.connections{list-style:none;padding:0;margin:16px 0}.connection{display:grid;grid-template-columns:minmax(0,1fr) 28px minmax(0,1.6fr);align-items:center;gap:8px;border-bottom:1px solid #ccd5cf;padding:12px 0;overflow-wrap:anywhere}.connection small{display:block;color:#526358}.connection .arrow{text-align:center}.notes{padding-left:24px}.notes li{margin:10px 0}.route{font-weight:bold}.checks{padding-left:26px}.checks li{margin:16px 0}.diagram-link{display:block}.reference{max-width:1045px}details summary{cursor:pointer}a:focus-visible,summary:focus-visible{outline:3px solid #176bc0;outline-offset:3px}@media(max-width:600px){main{padding:14px}h1{font-size:23px}h2{font-size:21px}.connection{grid-template-columns:minmax(0,1fr) 22px minmax(0,1.4fr);gap:4px}.caption{font-size:14px}}@media print{nav{display:none}section{break-before:page}main{padding:0}.connection{break-inside:avoid}}
</style></head><body><main>
<h1>外付け端子の配線図 19</h1>
<p>ESP32だけU3のソケットへ。R-78・ジャック・押しボタンなどは線で接続します。</p>
<p class="warning">配線と導通測定はUSB・9Vを抜いて行う。ジャック・ボタンの現物端子は未確認です。下の特定手順で確認できるまで、はんだ付け・通電しないでください。</p>
<p class="route">楽器 → INPUTジャック → J2 ／ J5 → OUTPUTジャック → アンプのINPUT</p>
<nav>${spec.map(s=>`<a href="#${s.ref}">${s.ref} ${h(s.title)}</a>`).join('')}<a href="#before-power">初回通電前</a><a href="#measure">電圧測定</a></nav>
${image('01_全体配線図.svg','基板から外付け部品へつなぐ全体図')}
<p class="caption">画像を押すと拡大表示。すべて部品面・USB左。裏面から見ると左右が逆です。線の経路は説明用で、実際の長さではありません。</p>
${spec.map((s,i)=>`<section id="${s.ref}"><h2>${h(s.ref+' '+s.title)}</h2><p>${h(s.flow)}</p>
<ul class="connections" aria-label="${s.ref}の接続先">${s.nets.map((n,j)=>`<li class="connection" data-wire="${s.ref}-${j+1}"><div><strong>${s.ref}-${j+1}</strong><small>${h(n)}</small></div><span class="arrow">→</span><div>${h(s.to[j])}</div></li>`).join('')}</ul>
<ul class="notes">${s.notes.map(n=>`<li>${h(n)}</li>`).join('')}</ul>
${s.ref==='U5'?'<p><strong>型番の印字が読める面を手前、足を下にすると、左から1：VIN、2：GND、3：5V出力。</strong> R-78E5.0-1.0以外には流用しないでください。</p>':''}
${image(filenames[i],s.ref+'の基板穴と相手端子')}
${helpers[s.ref]?`<p><a href="#${helpers[s.ref].slice(0,2)}">${s.ref==='U5'?'R-78本体の向きを図で確認':'端子の見分け方・導通確認を図で確認'}</a></p>`:''}
</section>`).join('')}
${extra.filter(d=>!d.name.startsWith('09_')).map(d=>`<section id="${d.name.slice(0,2)}"><h2>${h(d.title)}</h2>${image(d.name,d.title)}${d.name.startsWith('10_')?'<ol class="checks"><li>音声ジャックにケーブルの片端を挿します。反対端のプラグの<strong>金属の先端がTIP、絶縁リングより根元側の長い金属部がSLEEVE</strong>です。黒いグリップは測定しません。</li><li>テスターを導通モードにして、一方をTIP、他方をジャックの候補端子へ順に当てます。導通する端子をTIPと記録。SLEEVEも同様に記録します。</li><li>DCジャックは無通電の適合プラグで中心・外周と各端子の導通を調べます。ACから切り離し、通電中に導通モードを使わないでください。</li><li>同じ接点が複数見つかる、端子が測れない、切替端子を区別できない場合は、型番・写真で確認するまで止めます。</li></ol>':d.name.startsWith('11_')?'<ol class="checks"><li>任意の2本にプローブを当て、離しているときは非導通、押す間だけ導通することを確認。</li><li>その2本をJ4-1とJ4-2へ。常に導通する2本は使わず、残りの足は未接続。</li></ol>':'<p>印字面を手前・足を下。左1 → U5-1、中央2 → U5-2、右3 → U5-3。背面から見ると左右が逆です。</p>'}</section>`).join('')}
<section id="before-power"><h2>初回通電前：ここまでは電源OFF</h2>
<ol class="checks"><li>USB・9V・楽器・アンプをすべて外し、ESP32もソケットから外す。基板に残るICも誤配線で壊れるため、ESP32を外すだけでは保護できません。</li>
<li>部品面と裏面を見て、はんだブリッジ・飛び出した芯線・極性・穴番号を確認。R-78の3本を1本ずつ追い、足ごとに絶縁する。</li>
<li>テスターのリードは黒＝COM、赤＝V/Ωへ。無通電で抵抗／導通モードを使用し、J1-1とJ1-2、U5-1とU5-2、U5-2とU5-3、U5-1とU5-3の間に意図しない短絡がないか確認。</li>
<li>コンデンサの充電で一時的に鳴ることがあります。ほぼ0Ωが持続する・結果を判断できない場合は通電しない。ブザーが鳴らないだけで配線の正しさは保証されません。</li>
<li>外付けの線は短くし、引張りがはんだ部分に伝わらないよう固定。音声配線は電源配線から離す。</li></ol></section>
<section id="measure"><h2>電圧測定：5Vと3.3Vを確認</h2>
${image('09_電圧測定点.svg','黒と赤のプローブを当てる基板上の場所')}
<ul class="connections"><li class="connection"><div><strong>黒：B</strong><small>U3-21 / GND</small></div><span class="arrow">＋</span><div>赤：A / U3-1<br>期待値：約5V</div></li><li class="connection"><div><strong>黒：B</strong><small>U3-21 / GND</small></div><span class="arrow">＋</span><div>赤：C / C7左端<br>期待値：約3.3V</div></li></ul>
<ol class="checks"><li>電源OFFのまま黒プローブをBへ固定。ESP32は外したまま、赤リードをV/Ω端子、黒をCOM端子にし、テスターをDC電圧モードへ切り替える。電流端子・電流モードを使わない。</li>
<li>配線と9Vセンターマイナス電源を再確認してから9Vのみを接続。赤でA、Cを順に測る。C7の左右を先端で橋渡ししない。安全に固定できなければ通電せず、測定に慣れた人に確認を頼む。</li>
<li>値が大きく違う、電圧が不安定、異臭・異常発熱がある場合はすぐ電源を外す。異常があれば次へ進まない。</li>
<li>9Vを外し、残留電圧が下がったことを確認してESP32を装着。端子を短絡させて放電しない。信号・音出しの確認は電源チェック後に行う。</li></ol>
<p class="warning">書込み時は9Vを抜いてからESP32を基板から外し、ESP32単体をUSBにつなぎます。基板上でUSB単独給電する場合の逆流安全性は未確認です。</p></section>
<section><h2>確認範囲</h2><p>基板13接続と測定点のネット・座標は現行KiCadデータと照合。図の表示確認は実機の導通・電圧・音出し確認とは別です。R-78延長配線での安定性・ノイズは未確認です。</p><p>基板・Gerber・ファームウェアは変更していません。<a href="../hardware/datasheets_07/R-78E-1.0.pdf#page=4">保存済みR-78仕様書4ページ</a> ／ <a href="https://recom-power.com/pdf/Innoline/R-78E-1.0.pdf">RECOM公式仕様書</a> ／ <a href="18_基板とESP32_画像配線ガイド.html">ESP32のソケット・3Dガイド18</a></p></section>
</main></body></html>`;
};
