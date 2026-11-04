
import { NextResponse } from "next/server";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getHostname(value) {
  try {
    return new URL(value).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostnameMatches(adText, hostname) {
  if (!hostname) return false;

  const normalizedAd = normalizeText(adText).replace(/\\\./g, ".");
  const escaped = hostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\s/(@])(?:www\\.)?${escaped}(?=$|[\\s/:?#)])`, "i").test(normalizedAd);
}

export async function POST(request) {
  try {
    const body = await request.json();

    const ads = Array.isArray(body.ads)
      ? body.ads
      : [];

    const pages = Array.isArray(body.pages)
      ? body.pages
      : [];

    const matches = [];

    for (const page of pages) {
      const url = page.finalUrl || page.url;
      const hostname = getHostname(url);

      const matchingAds = ads.filter((ad) => {
        const text = [
          ad.advertiser,
          ad.copy,
        ].join(" ");

        return hostnameMatches(text, hostname);
      });

      matches.push({
        url,
        title: page.title || null,
        status: page.status || "pendiente",
        advertiser:
          matchingAds.length === 1
            ? matchingAds[0].advertiser
            : matchingAds.length > 1 &&
                matchingAds.every(
                  (ad) =>
                    ad.advertiser ===
                    matchingAds[0].advertiser
                )
              ? matchingAds[0].advertiser
              : null,
        matchedAdIds: matchingAds.map(
          (ad) => ad.id
        ),
        matchStatus:
          matchingAds.length > 0 &&
          matchingAds.every(
            (ad) =>
              ad.advertiser ===
              matchingAds[0].advertiser
          )
            ? "coincidencia_por_dominio"
            : "sin_asociacion_verificada",
      });
    }

    return NextResponse.json({
      total: matches.length,
      matches,
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
  }
}
