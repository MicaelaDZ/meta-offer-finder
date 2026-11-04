
import fs from "node:fs/promises";
import { chromium } from "playwright";

// Cargamos los destinos guardados.
const destinations = JSON.parse(
  await fs.readFile(
    "data/destinations.json",
    "utf8"
  )
);

const browser = await chromium.launch({
  headless: true,
});

const results = [];

try {
  for (const item of destinations) {
    console.log(`\n🔎 Analizando: ${item.advertiser}`);

    const page = await browser.newPage();

    try {
      const response = await page.goto(item.url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const httpStatus = response?.status() ?? null;

      const contentType =
        response?.headers()["content-type"] ?? "";

      // Detectamos documentos PDF directos.
      if (
        contentType
          .toLowerCase()
          .includes("application/pdf")
      ) {
        results.push({
          ...item,
          status: "pdf_directo",
          httpStatus,
          title: null,
          description: null,
          text: null,
        });

        console.log("📄 Enlace directo a PDF");
        continue;
      }

      // Extraemos el contenido visible.
      const data = await page.evaluate(() => {
        const description = document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content");

        return {
          title: document.title,
          description: description ?? null,
          text: document.body.innerText.slice(
            0,
            6000
          ),
        };
      });

      const pageText = [
        data.title,
        data.description,
        data.text,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      // Detectamos páginas de bloqueo.
      const blocked =
        /attention required.*cloudflare/i.test(
          data.title
        ) ||
        /checking your browser|verify you are human|just a moment/i.test(
          data.title
        ) ||
        (
          pageText.includes("cloudflare") &&
          pageText.includes("you have been blocked")
        ) ||
        httpStatus === 403 ||
        httpStatus === 429;

      // Detectamos otros errores HTTP.
      const httpError =
        httpStatus !== null &&
        httpStatus >= 400;

      let status = "analizado";

      if (blocked) {
        status = "bloqueado";
      } else if (httpError) {
        status = "error_http";
      }

      results.push({
        ...item,
        status,
        httpStatus,
        finalUrl: page.url(),
        ...data,
      });

      if (blocked) {
        console.log(
          "🔒 Página bloqueada: no se pudo analizar la oferta"
        );
      } else if (httpError) {
        console.log(
          `⚠️ Error HTTP: ${httpStatus}`
        );
      } else {
        console.log(
          "✅ Página leída:",
          data.title
        );
      }
    } catch (error) {
      results.push({
        ...item,
        status: "error",
        error: error.message,
      });

      console.log(
        "⚠️ No se pudo leer la página:",
        error.message
      );
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

// Guardamos los resultados.
await fs.mkdir("data", {
  recursive: true,
});

await fs.writeFile(
  "data/pages.json",
  JSON.stringify(results, null, 2),
  "utf8"
);

// Mostramos el resumen.
console.log("\n📊 RESUMEN\n");

for (const item of results) {
  console.log(
    `${item.advertiser}: ${item.status}`
  );
}

console.log(
  "\n📁 Guardado en data/pages.json"
);
