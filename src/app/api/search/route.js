
import { NextResponse } from "next/server";
import { chromium } from "playwright";

function normalizeUrl(href) {
  if (!href) return null;

  try {
    const url = new URL(
      href,
      "https://www.facebook.com"
    );

    // Algunos enlaces de Meta redirigen a una URL externa.
    if (
      url.hostname === "l.facebook.com" ||
      url.hostname === "lm.facebook.com"
    ) {
      const destination = url.searchParams.get("u");

      if (destination) {
        return normalizeUrl(destination);
      }
    }

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function isExternalDestination(href) {
  const normalized = normalizeUrl(href);

  if (!normalized) return false;

  try {
    const hostname = new URL(normalized)
      .hostname.toLowerCase();

      const excludedDomains = [
        "facebook.com",
        "instagram.com",
        "meta.com",
        "fb.com",
        "fb.me",
        "metastatus.com",
      ];

    return !excludedDomains.some(
      (domain) =>
        hostname === domain ||
        hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export async function POST(request) {
  let browser;

  try {
    const body = await request.json();
    const keyword = String(body.keyword ?? "").trim();

    if (!keyword || keyword.length > 100) {
      return NextResponse.json(
        { error: "Ingresá una búsqueda válida." },
        { status: 400 }
      );
    }

    const url = new URL(
      "https://www.facebook.com/ads/library/"
    );

    url.searchParams.set("active_status", "active");
    url.searchParams.set("ad_type", "all");
    url.searchParams.set("country", "AR");
    url.searchParams.set("q", keyword);
    url.searchParams.set(
      "search_type",
      "keyword_unordered"
    );

    browser = await chromium.launch({
      headless: true,
    });

    const page = await browser.newPage();

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

      
const initialAdsCount = await page
.getByText("Identificador de la biblioteca:", {
  exact: false,
})
.count();

for (let i = 0; i < 4; i++) {
await page.evaluate(() => {
  window.scrollTo(0, document.body.scrollHeight);
});

await page.waitForTimeout(1500);
}

await page.evaluate(() => {
window.scrollTo(0, 0);
});

const loadedAdsCount = await page
.getByText("Identificador de la biblioteca:", {
  exact: false,
})
.count();

    // Recuperamos texto y enlaces de la página.
   
const pageData = await page.evaluate(() => {
  const rawText =
    document.body?.innerText || "";

  const links = Array.from(
    document.querySelectorAll("a[href]")
  ).map((anchor) => ({
    href: anchor.href,
    text: (anchor.innerText || "")
      .trim()
      .slice(0, 200),
  }));

  const buttons = Array.from(
    document.querySelectorAll(
      'a, button, [role="button"]'
    )
  )
    .filter((element) => {
      const text = (
        element.innerText ||
        element.getAttribute("aria-label") ||
        ""
      ).trim().toLowerCase();

      return [
        "comprar",
        "más información",
        "mas informacion",
        "ver más",
        "ver mas",
        "descargar",
        "registrarte",
      ].some((word) => text.includes(word));
    })
    .slice(0, 100)
    .map((element) => ({
      tag: element.tagName,
      text: (
        element.innerText ||
        element.getAttribute("aria-label") ||
        ""
      )
        .trim()
        .slice(0, 120),
      href: element.getAttribute("href"),
      dataHref: element.getAttribute("data-href"),
      role: element.getAttribute("role"),
    }));

  return { rawText, links, buttons };
});


    const rawText = pageData.rawText;

    const text = /Ã.|Â.|â€|ð[^\s]?/.test(rawText)
      ? Buffer.from(rawText, "latin1").toString("utf8")
      : rawText;

    const sections = text.split(
      /(?=Identificador de la biblioteca:\s*\d+)/g
    );

    // Por ahora conservamos los enlaces externos
    // como candidatos, sin asignarlos a un anuncio
    // si no podemos comprobar la asociación.
    const externalLinks = [
      ...new Set(
        pageData.links
          .map((link) => normalizeUrl(link.href))
          .filter(isExternalDestination)
      ),
    ];

    const ads = [];

    for (const section of sections.slice(1)) {
      const id = section.match(
        /Identificador de la biblioteca:\s*(\d+)/
      )?.[1];

      if (!id) continue;

      const date = section.match(
        /En circulación desde el\s+([^\n]+)/
      )?.[1];

      const lines = section
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const advertisingIndex = lines.findIndex(
        (line) => line === "Publicidad"
      );

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
              .slice(0, 1500)
          : null;

      ads.push({
        id,
        advertiser,
        date: date ?? null,
        copy,
        sourceUrl:
          `https://www.facebook.com/ads/library/?id=${id}`,

        // Todavía no verificamos el destino individual.
        destinationUrl: null,
        destinationVerified: false,
      });
    }

    return NextResponse.json({
      keyword,
      country: "AR",
      total: ads.length,
      ads,
      initialAdsCount,
loadedAdsCount,

      // Diagnóstico para el próximo paso.
      externalLinks,
      externalLinksCount: externalLinks.length,
      buttonDiagnostics: pageData.buttons,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error desconocido",
      },
      { status: 500 }
    );
  } finally {
    await browser?.close();
  }
}
