
import { NextResponse } from "next/server";
import { chromium } from "playwright";

function isAllowedUrl(value) {
  try {
    const url = new URL(value);

    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1"
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function detectSignals(text) {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const digitalWords = [
    "ebook",
    "e-book",
    "recetario digital",
    "archivo pdf",
    "formato pdf",
    "descargable",
    "descarga digital",
    "curso online",
    "curso grabado",
    "plantilla digital",
    "acceso inmediato",
  ];

  const purchaseWords = [
    "comprar",
    "agregar al carrito",
    "añadir al carrito",
    "anadir al carrito",
    "finalizar compra",
    "checkout",
    "compralo ahora",
    "compra ahora",
  ];

  const deliveryWords = [
    "descarga inmediata",
    "acceso inmediato",
    "entrega automatica",
    "recibiras un email",
    "recibis un email",
    "descargar ahora",
  ];

  
const physicalPatterns = [
  /bandejas? de silicona/,
  /envio gratis.*pagas al recibir/,
  /pago contra entrega/,
  /paga al recibir/,
];

const freeDigitalPatterns = [
  /recetario digital (?:exclusivo y )?gratuito/,
  /recetario (?:es )?gratuito/,
  /pdf gratis/,
  /descarga gratuita/,
  /descargar gratis/,
];

const hasPhysicalSignal = physicalPatterns.some(
  (pattern) => pattern.test(normalized)
);

const hasFreeDigitalSignal = freeDigitalPatterns.some(
  (pattern) => pattern.test(normalized)
);

  const hasDigitalSignal = digitalWords.some(
    (word) => normalized.includes(word)
  );

  const hasPurchaseSignal = purchaseWords.some(
    (word) => normalized.includes(word)
  );

  const hasDeliverySignal = deliveryWords.some(
    (word) => normalized.includes(word)
  );

  const priceMatches = text.match(
    /(?:ARS|USD|US\$|\$)\s?[\d.,]+/gi
  );

  return {
    hasDigitalSignal,
    hasPurchaseSignal,
    hasDeliverySignal,
    hasPhysicalSignal,
    hasFreeDigitalSignal,
    pricesFound: [
      ...new Set(priceMatches || []),
    ].slice(0, 10),
  };
}

export async function POST(request) {
  let browser;

  try {
    const body = await request.json();

    const urls = Array.isArray(body.urls)
      ? body.urls.slice(0, 5)
      : [];

    if (urls.length === 0) {
      return NextResponse.json(
        { error: "No se recibieron URLs." },
        { status: 400 }
      );
    }

    browser = await chromium.launch({
      headless: true,
    });

    const results = [];

    for (const inputUrl of urls) {
      if (!isAllowedUrl(inputUrl)) {
        results.push({
          url: inputUrl,
          status: "error",
          reason: "URL no válida",
        });

        continue;
      }

      const page = await browser.newPage();

      try {
        const response = await page.goto(inputUrl, {
          waitUntil: "domcontentloaded",
          timeout: 25000,
        });

        await page.waitForTimeout(1500);

        const title = await page.title();

        const text = (
          await page.locator("body").innerText()
        ).slice(0, 20000);

        const signals = detectSignals(text);

        const httpStatus = response?.status() ?? null;

       
let status = "pendiente";

if (httpStatus && httpStatus >= 400) {
  status = "no_accesible";
} else if (signals.hasPhysicalSignal) {
  status = "posible_producto_fisico";
} else if (
  signals.hasFreeDigitalSignal &&
  !signals.hasPurchaseSignal
) {
  status = "posible_digital_gratuito";
} else if (
  signals.hasDigitalSignal &&
  signals.hasPurchaseSignal &&
  signals.pricesFound.length > 0
) {
  status = "candidato_digital_pago";
}


        results.push({
          url: inputUrl,
          finalUrl: page.url(),
          title,
          httpStatus,
          status,
          ...signals,
          textPreview: text.slice(0, 500),
        });
      } catch (error) {
        results.push({
          url: inputUrl,
          status: "error",
          reason: error.message,
        });
      } finally {
        await page.close();
      }
    }

    return NextResponse.json({
      total: results.length,
      results,
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
