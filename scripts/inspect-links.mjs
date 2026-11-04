
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: false,
});

try {
  const page = await browser.newPage();

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
    .waitFor({ timeout: 15000 });

  const links = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll("a[href]")
    )
      .map((a) => {
        const rawUrl = a.href;

        let destination = rawUrl;

        try {
          const parsed = new URL(rawUrl);

          // Meta puede envolver enlaces externos
          // en su propio sistema de redirección.
          if (
            parsed.hostname === "l.facebook.com"
          ) {
            destination =
              parsed.searchParams.get("u") ??
              rawUrl;
          }
        } catch {
          // Conservamos el enlace original.
        }

        return {
          texto: a.innerText.trim().slice(0, 100),
          destino: destination,
        };
      })
      .filter(({ destino }) => {
        try {
          const hostname = new URL(
            destino
          ).hostname.toLowerCase();

          return (
            hostname !== "facebook.com" &&
            !hostname.endsWith(".facebook.com") &&
            hostname !== "instagram.com" &&
            !hostname.endsWith(".instagram.com")
          );
        } catch {
          return false;
        }
      })
      .slice(0, 30);
  });

  console.log("\n🔗 ENLACES EXTERNOS\n");
  console.log(
    JSON.stringify(links, null, 2)
  );

  console.log(
    `\nTotal encontrados: ${links.length}`
  );
} finally {
  await browser.close();
}
