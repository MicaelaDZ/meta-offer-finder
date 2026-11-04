
import { NextResponse } from "next/server";

const MONTHS = {
  ene: 0,
  feb: 1,
  mar: 2,
  abr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dic: 11,
};

function parseMetaDate(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const match = value
    .toLowerCase()
    .trim()
    .match(/^(\d{1,2})\s+([a-záéíóú.]+)\s+(\d{4})$/);

  if (!match) return null;

  const day = Number(match[1]);
  const monthName = match[2].replace(".", "");
  const year = Number(match[3]);

  const month = MONTHS[monthName];

  if (month === undefined) return null;

  const date = new Date(
    Date.UTC(year, month, day)
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getGroupKey(ad) {
  const advertiser = normalizeText(
    ad.advertiser || "desconocido"
  );

  const copy = normalizeText(ad.copy)
    .slice(0, 180);

  return `${advertiser}::${copy}`;
}

export async function POST(request) {
  try {
    const body = await request.json();

    if (!Array.isArray(body.ads)) {
      return NextResponse.json(
        { error: "No se recibieron anuncios válidos." },
        { status: 400 }
      );
    }

    const groups = new Map();
    const seenIds = new Set();

    for (const ad of body.ads.slice(0, 100)) {
      if (!ad || !ad.id) continue;

      const id = String(ad.id);

      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const key = getGroupKey(ad);

      if (!groups.has(key)) {
        groups.set(key, {
          advertiser: ad.advertiser || "Desconocido",
          exampleCopy: ad.copy || "",
          ads: [],
        });
      }

      groups.get(key).ads.push({
        id,
        date: ad.date || null,
        sourceUrl: ad.sourceUrl || null,
      });
    }

    const now = new Date();
    const todayUTC = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );

    const results = [];

    for (const [key, group] of groups) {
      const dates = group.ads
        .map((ad) => parseMetaDate(ad.date))
        .filter((date) => date !== null)
        .sort((a, b) => a - b);

      const oldest = dates[0] ?? null;
      const newest = dates.at(-1) ?? null;

      const ageDays = oldest
        ? Math.max(
            0,
            Math.floor(
              (todayUTC - oldest.getTime()) /
                86400000
            )
          )
        : null;

      results.push({
        groupId: key,
        advertiser: group.advertiser,
        exampleCopy: group.exampleCopy,
        adsCount: group.ads.length,
        oldestAdDate: oldest
          ? oldest.toISOString().slice(0, 10)
          : null,
        newestAdDate: newest
          ? newest.toISOString().slice(0, 10)
          : null,
        ageDays,
        ads: group.ads,
      });
    }

    results.sort((a, b) => {
      if (b.adsCount !== a.adsCount) {
        return b.adsCount - a.adsCount;
      }

      return (b.ageDays ?? -1) -
        (a.ageDays ?? -1);
    });

    return NextResponse.json({
      totalAdsReceived: seenIds.size,
      totalGroups: results.length,
      groups: results,
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
