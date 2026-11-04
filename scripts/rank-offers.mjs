
import fs from "node:fs/promises";

const pages = JSON.parse(
  await fs.readFile(
    "data/classified-pages.json",
    "utf8"
  )
);

const ads = JSON.parse(
  await fs.readFile(
    "data/analyzed-ads.json",
    "utf8"
  )
);

const offers = pages.map((page) => {
  const relatedAds = ads.filter(
    (ad) =>
      ad.advertiser?.toLowerCase() ===
      page.advertiser?.toLowerCase()
  );

  const verifiedPaid =
    page.status === "analizado" &&
    page.esProductoDigitalPago === true &&
    [
      "ebook_pago",
      "pack_digital_pago",
    ].includes(page.categoria);

  const blockedOrUnknown =
    page.status !== "analizado" ||
    page.categoria === "desconocido";

  // Puntaje de evidencia, NO de ventas.
  let score = 0;

  if (verifiedPaid) score += 60;

  if (verifiedPaid && page.precioDetectado) {
    score += 15;
  }

  if (verifiedPaid && relatedAds.length > 0) {
    score += 10;
  }

  const estado = blockedOrUnknown
    ? "pendiente_verificacion"
    : verifiedPaid
      ? "candidato"
      : "no_cumple_criterio";

  return {
    anunciante: page.advertiser,
    producto: page.producto ?? null,
    nicho: page.nicho ?? null,
    categoria: page.categoria,
    estado,
    anunciosEncontrados: relatedAds.length,
    precioDetectado: page.precioDetectado ?? null,
    puntajeEvidencia: score,
    url: page.url,
  };
});

offers.sort(
  (a, b) =>
    b.puntajeEvidencia - a.puntajeEvidencia
);

await fs.writeFile(
  "data/ranking.json",
  JSON.stringify(offers, null, 2),
  "utf8"
);

console.log("\n🏆 RANKING PRELIMINAR\n");

for (const offer of offers) {
  console.log(
    `${offer.puntajeEvidencia} puntos | ` +
    `${offer.anunciante} | ${offer.estado}`
  );
}

console.log(
  "\n📁 Guardado en data/ranking.json"
);
