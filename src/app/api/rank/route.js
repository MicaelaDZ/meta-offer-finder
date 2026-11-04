import { NextResponse } from 'next/server';
import { rankGroups } from '../../../lib/ranking.mjs';
export async function POST(request) {
  try {
    const body = await request.json();
    const ranking = rankGroups(Array.isArray(body.groups) ? body.groups : [], Array.isArray(body.pages) ? body.pages : []);
    return NextResponse.json({ total: ranking.length, ranking });
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
}
