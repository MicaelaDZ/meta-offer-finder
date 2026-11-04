import { NextResponse } from 'next/server';
import { matchPages } from '../../../lib/association.mjs';
export async function POST(request) {
  try {
    const body = await request.json();
    const matches = matchPages(Array.isArray(body.ads) ? body.ads : [], Array.isArray(body.pages) ? body.pages : []);
    return NextResponse.json({ total: matches.length, matches });
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
}
