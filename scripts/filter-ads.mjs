
import fs from "node:fs/promises";

const ads = JSON.parse(
  await fs.readFile("data/ads.json", "utf8")
);

// Palabras que sugieren una oferta digital.
const positiveKeywords = [
  "ebook",
  "e-book",
  "libro digital",
  "guía digital",
  "guia digital",
  "pack digital",
  "recetario digital",
  "pdf descargable",
  "descarga inmediata",
  "curso online",
  "plantillas",
  "manualidades",
  "paso a paso",
  "bonos",
  "bonus",
];

// Términos que suelen indicar apps lectoras.
const negativeKeywords = [
  "pdf reader",
  "pdf viewer",
  "ebook reader",
  "download app",
  "app store",
  "google play",
];

function classifyAd(ad) {
  const text = [
    ad.advertiser,
    ad.copy,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const positiveMatches = positiveKeywords.filter(
    (keyword) => text.includes(keyword)
  );

  const negativeMatches = negativeKeywords.filter(
    (keyword) => text.includes(keyword)
  );

  let score = positiveMatches.length * 2;
  score -= negativeMatches.length * 5;

  return {
    ...ad,
    relevanceScore: score,
    positiveMatches,
    negativeMatches,
    classification:
      negativeMatches.length > 0
        ? "DESCARTAR"
        : score >= 2
          ? "REVISAR"
          : "SIN_EVIDENCIA",
  };
}

const results = ads.map(classifyAd);

const candidates = results.filter(
  (ad) => ad.classification === "REVISAR"
);

await fs.writeFile(
  "data/classified-ads.json",
  JSON.stringify(results, null, 2),
  "utf8"
);

console.log("\n📊 RESULTADOS DEL FILTRO\n");

console.log("Total analizados:", results.length);
console.log("Para revisar:", candidates.length);
console.log(
  "Descartados:",
  results.filter(
    (ad) => ad.classification === "DESCARTAR"
  ).length
);
console.log(
  "Sin evidencia suficiente:",
  results.filter(
    (ad) => ad.classification === "SIN_EVIDENCIA"
  ).length
);

console.log("\n🔎 POSIBLES OFERTAS DIGITALES\n");

console.log(
  JSON.stringify(
    candidates.map((ad) => ({
      advertiser: ad.advertiser,
      score: ad.relevanceScore,
      copy: ad.copy?.slice(0, 180),
    })),
    null,
    2
  )
);

console.log(
  "\n📁 Guardado en data/classified-ads.json"
);
