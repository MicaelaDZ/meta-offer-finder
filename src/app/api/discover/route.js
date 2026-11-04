import { NextResponse } from "next/server";
import { searchMetaAds } from "../../../lib/meta-search.mjs";
import { discover, searchOptions } from "../../../lib/discovery.mjs";
import { acquireBrowserWork } from "../../../lib/browser.mjs";

export async function POST(request) {
  let release;
  let cooldown = false;
  try {
    const body = await request.json();
    let options;
    try { options = searchOptions(body); }
    catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
    release = acquireBrowserWork(true);
    const result = await discover(options, searchMetaAds, { signal: request.signal });
    cooldown = result.searches.length > 0 && result.sourceDiagnostic?.code !== "META_SOURCE_DISABLED";
    const failed = result.searches.every(search => search.error);
    const error = result.sourceDiagnostic?.message || "No se pudo consultar Meta.";
    return NextResponse.json(failed ? { ...result, error } : result, { status: failed ? 503 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  } finally { release?.({ cooldown }); }
}
