import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = 'http://127.0.0.1:4000';   // local access from the server

export async function POST(request: NextRequest) {
  // Extract real client IP from the incoming request headers
  const forwarded = request.headers.get('x-forwarded-for');
  const clientIP = forwarded?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1';

  // Forward it to the backend inside the JSON body
  const backendRes = await fetch(`${BACKEND_URL}/api/public/tailscale-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientIP }),   // this was missing
  });

  return NextResponse.json(await backendRes.json());
}