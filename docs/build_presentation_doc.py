from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

OUT = 'docs/MEFX-S3_発表用資料.docx'

def shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr(); shd = OxmlElement('w:shd'); shd.set(qn('w:fill'), fill); tcPr.append(shd)

def add_table(doc, headers, rows):
    t = doc.add_table(rows=1, cols=len(headers)); t.style = 'Table Grid'; t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(headers):
        c=t.rows[0].cells[i]; c.text=h; shade(c,'1F4E79')
        for r in c.paragraphs[0].runs: r.bold=True; r.font.color.rgb=RGBColor(255,255,255); r.font.size=Pt(9)
    for row in rows:
        cs=t.add_row().cells
        for i,v in enumerate(row):
            cs[i].text=str(v)
            for r in cs[i].paragraphs[0].runs: r.font.size=Pt(8.5)
        if len(t.rows)%2==0:
            for c in cs: shade(c,'EAF2F8')
    doc.add_paragraph()

def h(doc, text, level=1):
    p=doc.add_paragraph(style=f'Heading {level}'); p.paragraph_format.keep_with_next=True; p.add_run(text)

def bullet(doc, text):
    p=doc.add_paragraph(style='List Bullet'); p.paragraph_format.space_after=Pt(2); p.add_run(text)

def num(doc, text):
    p=doc.add_paragraph(style='List Number'); p.paragraph_format.space_after=Pt(2); p.add_run(text)

doc=Document(); sec=doc.sections[0]
sec.top_margin=Inches(.65); sec.bottom_margin=Inches(.65); sec.left_margin=Inches(.75); sec.right_margin=Inches(.75)
doc.styles['Normal'].font.name='Aptos'; doc.styles['Normal'].font.size=Pt(10)
doc.styles['Heading 1'].font.color.rgb=RGBColor(31,78,121); doc.styles['Heading 1'].font.size=Pt(16)
doc.styles['Heading 2'].font.color.rgb=RGBColor(47,84,150); doc.styles['Heading 2'].font.size=Pt(12)

p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; r=p.add_run('MEFX-S3 マルチエフェクター製作'); r.bold=True; r.font.size=Pt(24); r.font.color.rgb=RGBColor(31,78,121)
p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; r=p.add_run('発表用まとめ資料'); r.font.size=Pt(15); r.font.color.rgb=RGBColor(89,89,89)
p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; r=p.add_run('ESP32-S3 / 専用基板 / Windowsアプリ / 2026年7月'); r.font.size=Pt(10)
p=doc.add_paragraph(); r=p.add_run('発表の要点: '); r.bold=True; r.font.color.rgb=RGBColor(192,80,77); p.add_run('ハードウェア、ファームウェア、デスクトップアプリを一体で開発し、ソフトウェアはPhase 40相当まで検証済み。現在は実機BLE通信と音声入出力の総合確認が次の段階である。')

h(doc,'1. 目的と製作物'); doc.add_paragraph('ESP32-S3を使い、ギターとベースの両方に対応するマルチエフェクター試作v1を製作した。音色パラメータの編集、プリセット保存、PCでの試聴、Bluetooth経由の本体操作までを一つのシステムとして設計している。')
for x in ['ESP32-S3本体とファームウェア','KiCadで設計した専用基板','JLC3DP向け3Dプリントケース','Web/PWA版操作画面','Electron製Windowsアプリ MEFX-S3 Desktop','ローカル音源解析サーバー','JLCPCB発注用Gerber・BOM・CPL']: bullet(doc,x)

h(doc,'2. 基板・回路のデータ'); add_table(doc,['項目','値'], [('基板サイズ','150 mm × 90 mm'),('基板厚','1.6 mm'),('ネット数','40'),('パッド総数','206'),('フットプリント','70'),('SMT部品','59個'),('THT部品','11個'),('貫通ビア','43個'),('最小配線幅','0.2500 mm'),('最小クリアランス','0.2016 mm'),('最小ドリル径','0.3000 mm'),('取付用NPTH','4個')])
doc.add_paragraph('主要部品は、入力プリアンプのTL072、音声AD/DA変換のCS4270-CZZR、3.3VレギュレータのAP2112K-3.3、電源保護のSS14である。ESP32-S3は上面ソケットに取り付け、USB端子をケース開口側へ向ける。')
add_table(doc,['検証項目','結果'], [('DRC違反','0'),('未配線','0'),('ERC','エラー0、警告0'),('接続監査','39ネット／167端子一致'),('JLCPCBデータ','Gerber・BOM・CPL作成済み'),('基板枚数','5枚発注用')])

h(doc,'3. アプリの機能と内部処理'); doc.add_paragraph('アプリはRenderer、Preload、Electron Mainの3層構成である。React画面からの操作は、Preloadで許可したIPC経由で保存、解析、Bluetooth処理へ渡される。')
for x in ['プリセット: 6種類のエフェクト値を0〜100で検証し、JSONとしてuserDataへ保存','Audio FX: PC入力をAudioContextへ取り込み、WAV IRをConvolverNodeで畳み込み、IRあり/なしをA/B比較','Tone Match: URLと楽器種別から候補プリセットとIRプロファイルを生成','deviceTone: 長いWAV IRをESP32向けの軽量パラメータへ変換','BLE: プリセットをJSON→UTF-8バイト列としてGATTへ送信し、状態・テレメトリ通知を受信','解析: Python、ffmpeg、yt-dlp、Demucs等をローカル処理する構成']: bullet(doc,x)

h(doc,'4. 使用技術'); add_table(doc,['分野','技術'], [('マイコン','ESP32-S3 / ESP-IDF / C'),('回路・基板','KiCad / ERC / DRC'),('アプリ','Electron / React / TypeScript / Vite'),('音声処理','Web Audio API / AudioContext / ConvolverNode'),('通信','BLE / GATT / Web Bluetooth'),('解析','Python / ffmpeg / yt-dlp / Demucs / PyTorch / Torchaudio'),('製造','JLCPCB / JLC3DP / STL'),('検証','PowerShell / pnpm / Electron smoke test')])

h(doc,'5. 進捗'); add_table(doc,['項目','状態'], [('回路図・PCB','完了。ERC/DRC・接続監査済み'),('ファームウェア','ビルド確認済み、書き込み可能'),('Windowsアプリ','Phase 40相当まで完了'),('アプリ検証','ビルド・Electron起動・解析health確認済み'),('インストーラー','生成済み'),('基板','到着済み'),('実ESP32 BLE','未確認'),('実音声入出力','未確認'),('総合音出し','未完了')])

h(doc,'6. 完成までの道のり')
for x in ['不足部品をそろえる','ESP32-S3へファームウェアを書き込む','MEFX-S3としてBLE広告されることを確認する','Windowsアプリから接続し、プリセット送信・保存・読込・削除を確認する','9V、5V、3.3V、4.5V仮想GNDを順番に測定する','音声入力、マイク、音声出力、フットスイッチを確認する','ケースへ組み込み、ギターとベースで実音を確認する','完成判定チェックリストを埋める']: num(doc,x)

h(doc,'7. 発表用結論'); doc.add_paragraph('本製作では、音声エフェクトのプログラムだけでなく、回路設計、PCB製造データ、ケース設計、ESP32ファームウェア、Windowsアプリまでを一貫して開発した。現在はソフトウェア試作が完成判定に近く、実機側ではBLE通信、電源、音声入出力の確認を残している。')
h(doc,'8. 参考文献')
for x in ['Udo Zölzer (ed.), DAFX: Digital Audio Effects, 2nd ed., Wiley.','M. R. Schroeder, “Natural Sounding Artificial Reverberation,” Journal of the Audio Engineering Society, Vol. 10, No. 3, pp. 219–223, 1962.','DAFx公式サイト: https://www.dafx.de/']: bullet(doc,x)
footer=sec.footer.paragraphs[0]; footer.alignment=WD_ALIGN_PARAGRAPH.CENTER; footer.add_run('MEFX-S3 発表用資料 | プロジェクト進捗に基づく整理').font.size=Pt(8)
doc.save(OUT); print(OUT)
