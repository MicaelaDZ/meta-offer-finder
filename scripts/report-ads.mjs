
import fs from "node:fs/promises";

const ads = JSON.parse(
  await fs.readFile(
    "data/analyzed-ads.json",
    "utf8"
  )
);

const report = {
  total: ads.length,
  candidatos: [],
  descartados: [],
  verificar: [],
};

for (const ad of ads) {
  const analysis = ad.analysis;

  if (!analysis) {
    report.verificar.push(ad);
    continue;
  }

  const text = [
    ad.advertiser,
    ad.copy,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Señales claras de una aplicación lectora.
  const isReaderApp =
    /pdf reader|pdf viewer|ebook reader/i.test(
      text
    );

  // Señales de un producto físico conocido
  // en nuestra muestra inicial.
  const isPhysicalCandidate =
    /bunion fix/i.test(text);

  // Señales de contenido gratuito.
  const isFree =
    /\bfree\b|gratis|gratuito|gratuita/i.test(
      text
    );

  const item = {
    id: ad.id,
    anunciante: ad.advertiser,
    producto: analysis.producto,
    nicho: analysis.nicho,
    categoria: analysis.categoria,
    motivo: analysis.motivo,
    url: ad.sourceUrl,
  };

  if (
    isReaderApp ||
    analysis.categoria === "servicio_app" ||
    analysis.categoria === "fisico"
  ) {
    report.descartados.push(item);
  } else if (
    isPhysicalCandidate ||
    isFree ||
    analysis.categoria === "desconocido"
  ) {
    report.verificar.push(item);
  } else if (
    analysis.categoria === "digital_pago"
  ) {
    report.candidatos.push(item);
  } else {
    report.descartados.push(item);
  }
}

await fs.writeFile(
  "data/opportunities.json",
  JSON.stringify(report, null, 2),
  "utf8"
);

console.log("\n📊 REPORTE DE OPORTUNIDADES\n");

console.log("Total:", report.total);
console.log(
  "Candidatos:",
  report.candidatos.length
);
console.log(
  "Para verificar:",
  report.verificar.length
);
console.log(
  "Descartados:",
  report.descartados.length
);

console.log("\n🔎 CANDIDATOS\n");

for (const ad of report.candidatos) {
  console.log(
    `• ${ad.anunciante} — ${ad.producto}`
  );
}

console.log(
  "\n📁 Reporte guardado en data/opportunities.json"
);
