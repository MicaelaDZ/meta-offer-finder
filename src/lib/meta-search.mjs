
import { extractPageEvidence } from "./page-evidence.mjs";
import { searchProfile } from "./search-policy.mjs";
import { launchBrowser } from "./browser.mjs";
import { parseMetaText, LIBRARY_MARKER } from "./meta-parser.mjs";

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

export async function searchMetaAds({ keyword, country = "AR", language = "all", mode = "manual", timeoutMs = searchProfile(mode).timeoutMs, signal }) {
  const policy = searchProfile(mode);
  const started = Date.now();
  let browser;
  let timer;
  let abort;
  try {
    if (signal?.aborted) throw new Error("Búsqueda cancelada.");
    const url = new URL(
      "https://www.facebook.com/ads/library/"
    );

    url.searchParams.set("active_status", "active");
    url.searchParams.set("ad_type", "all");
    url.searchParams.set("country", country);
    url.searchParams.set("locale", "es_LA");
    url.searchParams.set("q", keyword);
    url.searchParams.set(
      "search_type",
      "keyword_unordered"
    );

    browser = await launchBrowser();
    abort = () => { void browser.close().catch(() => {}); };
    timer = setTimeout(abort, Math.max(1, timeoutMs - (Date.now() - started)));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();

    const page = await browser.newPage({ locale: "es-AR" });

    await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: Math.min(policy.navigationMs, timeoutMs),
    });

    await page
      .getByText(LIBRARY_MARKER)
      .first()
      .waitFor({ timeout: Math.min(policy.markerMs, timeoutMs) })
      .catch(() => {});

      
const initialAdsCount = await page
.getByText(LIBRARY_MARKER)
.count();

for (let i = 0; i < policy.scrolls; i++) {
await page.evaluate(() => {
  window.scrollTo(0, document.body.scrollHeight);
});

await page.waitForTimeout(policy.scrollDelayMs);
}

await page.evaluate(() => {
window.scrollTo(0, 0);
});

const loadedAdsCount = await page
.getByText(LIBRARY_MARKER)
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

    const visibleEvidence = await page.evaluate(extractPageEvidence);
    const ads = parseMetaText(visibleEvidence.evidenceText).map(ad => ({ ...ad, copyTruncated: Boolean(ad.copyTruncated || visibleEvidence.textTruncated), language: ad.copyTruncated || visibleEvidence.textTruncated ? "unknown" : ad.language }));
    const filtered = ads.filter(ad => language === "all" || ad.language === language).slice(0, 100);
    // Only links explicitly present in retained ad copy survive a language filter.
    const copyLinks = filtered.flatMap(ad => ad.copy?.match(/https?:\/\/[^\s<>]+/g) || []).map(normalizeUrl).filter(isExternalDestination);
    const candidates = [...new Set(language === "all" ? [...copyLinks, ...externalLinks] : copyLinks)].slice(0, mode === "manual" ? 100 : 25);
    return {
      keyword,
      country,
      language,
      total: filtered.length,
      ads: filtered,
      warnings: ads.length === 0 ? ["No se pudieron extraer anuncios. Meta puede haber mostrado consentimiento, un bloqueo o un formato no reconocido; no se confirma ausencia de anuncios."] : language !== "all" ? ["Filtro de idioma estimado: textos desconocidos excluidos; se verifican sólo URLs explícitas de los anuncios retenidos."] : [],
      initialAdsCount,
loadedAdsCount,

      // Diagnóstico para el próximo paso.
      externalLinks: candidates,
      externalLinksCount: candidates.length,
      buttonDiagnostics: pageData.buttons,
    };
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
    await browser?.close();
  }
}
