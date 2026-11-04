
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: false,
});

const page = await browser.newPage({
  viewport: {
    width: 1440,
    height: 900,
  },
});

const url =
  "https://www.facebook.com/ads/library/" +
  "?active_status=active" +
  "&ad_type=all" +
  "&country=AR" +
  "&q=ebook" +
  "&search_type=keyword_unordered";

await page.goto(url, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});

console.log("URL:", page.url());
console.log("Título:", await page.title());

console.log(
  "¿Se abrió la Biblioteca de Anuncios?",
  page.url().includes("/ads/library")
);

await page.screenshot({
  path: "meta-test.png",
  fullPage: false,
});

console.log("Captura guardada: meta-test.png");

// Dejamos el navegador abierto 15 segundos.
await page.waitForTimeout(15000);

await browser.close();
