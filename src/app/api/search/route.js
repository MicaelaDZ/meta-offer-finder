import { NextResponse } from "next/server";
import { searchMetaAds } from "../../../lib/meta-search.mjs";
import { searchOptions } from "../../../lib/discovery.mjs";
import { acquireBrowserWork } from "../../../lib/browser.mjs";

export async function POST(request) {
  let release;
  try {
    const body = await request.json();
    let options;
    try {
      options = searchOptions(body);
      if (typeof body.keyword !== "string" || !body.keyword.trim() || body.keyword.trim().length > 100) throw new Error("Ingresá una búsqueda válida.");
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    release = acquireBrowserWork();
    return NextResponse.json(await searchMetaAds({ ...options, keyword: body.keyword.trim(), signal: request.signal }));
  } catch (error) {
    return NextResponse.json({ error: error.message, ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}) }, { status: error.status || 500 });
  } finally { release?.(); }
}
