import { NextResponse } from 'next/server';
import { groupAds } from '../../../lib/grouping.mjs';
export async function POST(request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.ads)) return NextResponse.json({ error: 'No se recibieron anuncios válidos.' }, { status: 400 });
    return NextResponse.json(groupAds(body.ads));
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
}
