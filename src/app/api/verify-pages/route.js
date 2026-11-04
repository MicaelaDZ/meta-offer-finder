
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { launchBrowser, acquireBrowserWork } from "../../../lib/browser.mjs";
import { extractPageEvidence } from "../../../lib/page-evidence.mjs";
import { classifyOffer } from "../../../lib/evidence.mjs";

function isAllowedUrl(value) {
  try {
    const url = new URL(value);

    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    if (
      isIP(hostname.replace(/^\[|\]$/g, "")) !== 0 ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
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

export async function POST(request) {
  let browser;
  let release;
  let timer;
  let abort;

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

    release = acquireBrowserWork();
    browser = await launchBrowser();
    const deadline = Date.now() + 40000;
    abort = () => { void browser.close().catch(() => {}); };
    timer = setTimeout(abort, 40000);
    request.signal.addEventListener("abort", abort, { once: true });

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

      if (request.signal.aborted || Date.now() >= deadline) {
        results.push({ url: inputUrl, status: "error", reason: "Límite de tiempo alcanzado; página no verificada." });
        continue;
      }
      let page;

      try {
        page = await browser.newPage();
        page.setDefaultTimeout(4000);
        // Apply the URL guard to redirects and subresources too.
        await page.route("**/*", route => isAllowedUrl(route.request().url()) ? route.continue() : route.abort());
        const response = await page.goto(inputUrl, {
          waitUntil: "domcontentloaded",
          timeout: Math.max(1, Math.min(12000, deadline - Date.now())),
        });

        await page.waitForTimeout(500);

        const title = await page.title();

        const evidence = await page.evaluate(extractPageEvidence);
        const text = evidence.evidenceText;
        const signals = classifyOffer(text, { incomplete: evidence.textTruncated });

        const httpStatus = response?.status() ?? null;

       
const status = httpStatus && httpStatus >= 400 ? "no_accesible" : signals.classification === "sin_evidencia_suficiente" ? "pendiente" : signals.classification;

        results.push({
          url: inputUrl,
          finalUrl: page.url(),
          title,
          httpStatus,
          status,
          ...signals,
          ...evidence,
          textPreview: text.slice(0, 500),
        });
      } catch (error) {
        results.push({
          url: inputUrl,
          status: "error",
          reason: error.message,
        });
      } finally {
        await page?.close().catch(() => {});
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
      { status: error.status || 500 }
    );
  } finally {
    clearTimeout(timer);
    if (abort) request.signal.removeEventListener("abort", abort);
    await browser?.close().catch(() => {});
    release?.();
  }
}
