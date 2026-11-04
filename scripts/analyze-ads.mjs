
import fs from "node:fs/promises";
import ollama from "ollama";

const ads = JSON.parse(
  await fs.readFile("data/ads.json", "utf8")
);

// Analizamos primero 5 para probar el sistema.
const sample = ads;
const results = [];

for (const ad of sample) {
  console.log(`\nAnalizando: ${ad.advertiser}`);

  try {
    const response = await ollama.chat({
      model: "qwen2.5:7b",
      format: "json",
      options: {
        temperature: 0,
      },
     
messages: [
    {
      role: "system",
      content: `
  Sos un clasificador de anuncios de Meta.
  
  Clasificá cada anuncio como:
  - digital_pago
  - digital_gratuito
  - fisico
  - servicio_app
  - desconocido
  
  Una aplicación lectora de PDF es servicio_app,
  no un ebook pago.
  
  No inventes información.
  
  Respondé únicamente con un JSON que incluya:
  categoria, producto, nicho,
  es_oportunidad_para_investigar y motivo.
  `,
    },
    {
      role: "user",
      content: JSON.stringify({
        anunciante: ad.advertiser,
        texto: ad.copy,
      }),
    },
  ],
  
    });

    const analysis = JSON.parse(
      response.message.content
    );

    const adText = [
        ad.advertiser,
        ad.copy,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      
      // Regla fija para aplicaciones lectoras de PDF.
      const isPdfReaderApp =
        /pdf reader|pdf viewer|ebook reader/i.test(
          adText
        ) &&
        /app|application|aplicación|aplicacion/i.test(
          adText
        );
      
      if (isPdfReaderApp) {
        analysis.categoria = "servicio_app";
        analysis.producto = "Aplicación lectora de PDF";
        analysis.es_oportunidad_para_investigar = false;
        analysis.motivo =
          "Promociona una aplicación lectora de PDF, no una oferta de ebook pago.";
      }
      
      // Solo consideramos candidatos los productos
      // digitales pagos.
      if (analysis.categoria !== "digital_pago") {
        analysis.es_oportunidad_para_investigar = false;
      }
      
    results.push({
      ...ad,
      analysis,
    });

    console.log(analysis);
  } catch (error) {
    console.error(
      `Error analizando ${ad.id}:`,
      error.message
    );

    results.push({
      ...ad,
      analysis: null,
      error: error.message,
    });
  }
}

await fs.writeFile(
  "data/analyzed-ads.json",
  JSON.stringify(results, null, 2),
  "utf8"
);

console.log(
  "\n✅ Análisis guardado en data/analyzed-ads.json"
);
