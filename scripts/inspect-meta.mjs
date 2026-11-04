
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

const url = new URL(
  "https://www.facebook.com/ads/library/"
);

url.searchParams.set("active_status", "active");
url.searchParams.set("ad_type", "all");
url.searchParams.set("country", "AR");
url.searchParams.set("q", "ebook");
url.searchParams.set(
  "search_type",
  "keyword_unordered"
);

await page.goto(url.toString(), {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});

// Esperamos a que aparezca contenido visible.
await page.waitForTimeout(5000);

const data = await page.evaluate(() => {
  const text = document.body.innerText;

  const links = Array.from(
    document.querySelectorAll("a[href]")
  )
    .map((a) => ({
      text: a.innerText.trim().slice(0, 100),
      href: a.href,
    }))
    .filter((a) => a.href.includes("facebook.com"));

  return {
    title: document.title,
    textLength: text.length,
    textPreview: text.slice(0, 3000),
    links: links.slice(0, 20),
  };
});

console.log("\n=== DATOS DE META ===\n");
console.log(JSON.stringify(data, null, 2));

await browser.close();
