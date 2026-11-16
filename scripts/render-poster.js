const { chromium } = require("playwright");
const { pathToFileURL } = require("url");
const path = require("path");

async function main() {
  const [htmlPath, pdfPath, pngPath] = process.argv.slice(2);
  if (!htmlPath || !pdfPath || !pngPath) {
    console.error("usage: node scripts/render-poster.js <input.html> <output.pdf> <preview.png>");
    process.exit(2);
  }

  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });
  const page = await browser.newPage({
    viewport: { width: 2200, height: 1600 },
    deviceScaleFactor: 1
  });

  await page.goto(pathToFileURL(path.resolve(htmlPath)).href, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: path.resolve(pdfPath),
    format: "A3",
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" }
  });

  await page.emulateMedia({ media: "screen" });
  await page.screenshot({
    path: path.resolve(pngPath),
    fullPage: true
  });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
