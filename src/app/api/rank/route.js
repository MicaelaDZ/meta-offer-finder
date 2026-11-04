import { classifyOffer } from "../../../lib/evidence.mjs";

import { NextResponse } from "next/server";

function getAgeScore(days) {
  const age = Number(days);

  if (!Number.isFinite(age) || age < 0) return 0;
  if (age >= 180) return 25;
  if (age >= 90) return 20;
  if (age >= 60) return 15;
  if (age >= 30) return 10;
  if (age >= 14) return 5;

  return 0;
}

function getAdsScore(count) {
  const ads = Number(count);

  if (!Number.isFinite(ads) || ads < 1) return 0;
  if (ads >= 10) return 10;
  if (ads >= 5) return 8;
  if (ads >= 3) return 6;
  if (ads >= 2) return 4;

  return 2;
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function POST(request) {
  try {
    const body = await request.json();

    const groups = Array.isArray(body.groups)
      ? body.groups
      : [];

    const pages = Array.isArray(body.pages)
      ? body.pages
      : [];

    const matches = Array.isArray(body.matches)
      ? body.matches
      : [];

    const ranking = groups.map((group) => {
      const advertiser = normalize(group.advertiser);

      const matchingLinks = matches.filter(
        (match) =>
          match.matchStatus ===
            "coincidencia_por_dominio" &&
          normalize(match.advertiser) === advertiser &&
          group.ads?.some(ad => match.matchedAdIds?.includes(ad.id))
      );

      const matchedPage = pages.find((page) =>
        page.status !== "error" && page.status !== "no_accesible" && page.httpStatus >= 200 && page.httpStatus < 400 && matchingLinks.some(
          (match) =>
            match.url === page.url ||
            match.url === page.finalUrl
        )
      );

      let digitalPurchaseScore = 0;
      let deliveryScore = 0;
      let associationScore = 0;

      if (matchedPage) {
        if (matchedPage.hasDigitalSignal) {
          digitalPurchaseScore += 10;
        }

        if (matchedPage.hasPurchaseSignal) {
          digitalPurchaseScore += 10;
        }

        if (
          Array.isArray(matchedPage.pricesFound) &&
          matchedPage.pricesFound.length > 0
        ) {
          digitalPurchaseScore += 10;
        }

        if (matchedPage.hasDeliverySignal) {
          deliveryScore = 25;
        }

        if (matchingLinks.length > 0) {
          associationScore = 10;
        }
      }

      const ageScore = getAgeScore(group.ageDays);
      const adsScore = getAdsScore(group.adsCount);

      const score =
        digitalPurchaseScore +
        deliveryScore +
        ageScore +
        adsScore +
        associationScore;

     
const adSignals = classifyOffer(group.exampleCopy);
const excluded = ["posible_producto_fisico", "posible_servicio", "posible_digital_gratuito"];
const pageExcluded = matchedPage && (excluded.includes(matchedPage.status) || matchedPage.conflict);
let status = "sin_evidencia_suficiente";
if (pageExcluded || excluded.includes(adSignals.classification) || adSignals.conflict) {
  status = pageExcluded ? (matchedPage.conflict ? "sin_evidencia_suficiente" : matchedPage.status) : adSignals.classification;
} else if (matchedPage?.status === "candidato_digital_pago") {
  status = "candidato_digital_pago";
} else if (adSignals.isCandidate) {
  status = "candidato_por_anuncio";
}

      const excludedFromRanking = excluded.includes(status) || adSignals.conflict || Boolean(pageExcluded);
      return {
        groupId: group.groupId,
        advertiser: group.advertiser,
        product: matchedPage?.title || null,
        url: matchedPage?.finalUrl ||
          matchedPage?.url ||
          null,
        status,
        score: excludedFromRanking ? 0 : score,
        adSignals,
        adsCount: group.adsCount,
        ageDays: group.ageDays,
        oldestAdDate: group.oldestAdDate,
        hasDigitalSignal:
          matchedPage?.hasDigitalSignal || false,
        hasPurchaseSignal:
          matchedPage?.hasPurchaseSignal || false,
        hasDeliverySignal:
          matchedPage?.hasDeliverySignal || false,
        pricesFound:
          matchedPage?.pricesFound || [],
        scoreBreakdown: {
          digitalPurchase: excludedFromRanking ? 0 : digitalPurchaseScore,
          delivery: excludedFromRanking ? 0 : deliveryScore,
          age: excludedFromRanking ? 0 : ageScore,
          ads: excludedFromRanking ? 0 : adsScore,
          association: excludedFromRanking ? 0 : associationScore,
        },
      };
    });


    const statusPriority = {
      candidato_digital_pago: 2,
      candidato_por_anuncio: 1,
      sin_evidencia_suficiente: 0,
      pendiente_verificacion: 0,
    };
    
    ranking.sort((a, b) => {
      const priorityA = statusPriority[a.status] ?? 0;
      const priorityB = statusPriority[b.status] ?? 0;
    
      if (priorityB !== priorityA) {
        return priorityB - priorityA;
      }
    
      return b.score - a.score;
    });
    

    return NextResponse.json({
      total: ranking.length,
      ranking,
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
