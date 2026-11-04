
import { chromium } from "playwright";
import fs from "node:fs/promises";

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

await page
  .getByText("Identificador de la biblioteca:", {
    exact: false,
  })
  .first()
  .waitFor({ timeout: 15000 })
  .catch(() => {});

const text = await page.locator("body").innerText();

// Separamos los anuncios por su identificador.
const sections = text.split(
  /(?=Identificador de la biblioteca:\s*\d+)/g
);

const ads = [];

for (const section of sections.slice(1)) {
  const id = section.match(
    /Identificador de la biblioteca:\s*(\d+)/
  )?.[1];

  const date = section.match(
    /En circulación desde el\s+([^\n]+)/
  )?.[1];

  if (!id) continue;

  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const advertisingIndex =
    lines.findIndex((line) => line === "Publicidad");

  const advertiser =
    advertisingIndex > 0
      ? lines[advertisingIndex - 1]
      : null;

  const copy =
    advertisingIndex >= 0
      ? lines
          .slice(
            advertisingIndex + 1,
            advertisingIndex + 12
          )
          .join(" ")
          .slice(0, 2000)
      : null;

  ads.push({
    id,
    date: date ?? null,
    advertiser,
    copy,
    country: "AR",
    searchKeyword: "ebook",
    sourceUrl:
      `https://www.facebook.com/ads/library/?id=${id}`,
  });
}

await fs.mkdir("data", {
  recursive: true,
});

await fs.writeFile(
  "data/ads.json",
  JSON.stringify(ads, null, 2),
  "utf8"
);

console.log(
  `\n✅ Se encontraron ${ads.length} anuncios.\n`
);

console.log(
  JSON.stringify(ads.slice(0, 3), null, 2)
);

console.log(
  "\n📁 Guardado en data/ads.json"
);

await browser.close();
