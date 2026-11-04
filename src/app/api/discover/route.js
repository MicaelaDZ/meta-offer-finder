import { NextResponse } from "next/server";
import { searchMetaAds } from "../../../lib/meta-search.mjs";
import { discover, searchOptions } from "../../../lib/discovery.mjs";
import { acquireBrowserWork } from "../../../lib/browser.mjs";

export async function POST(request) {
  let release;
  try {
    const body = await request.json();
    let options;
    try { options = searchOptions(body); }
    catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
    release = acquireBrowserWork(true);
    const result = await discover(options, searchMetaAds, { signal: request.signal });
    return NextResponse.json({ ...result, ...(result.searches.every(s => s.error) ? { error: "No se pudo consultar Meta. Revisá los errores por categoría; no hay resultados verificados." } : {}) }, { status: result.searches.every(s => s.error) ? 503 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  } finally { release?.(); }
}
