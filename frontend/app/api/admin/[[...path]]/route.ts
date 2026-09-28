// ============================================================================
// CHECKPOINT A — Next.js proxy route, TEMPORARY debug version
// ============================================================================
// Drop this in place of your real proxy route TEMPORARILY. It behaves
// identically to your real proxy but adds loud, unmissable logging at the
// exact point where the cookie header is read from the incoming request
// and the exact point where it's set on the outgoing request to the
// Express backend.
//
// WHAT TO LOOK FOR IN YOUR NEXT.JS SERVER LOGS after hitting "refresh" once:
//   [CHECKPOINT-A] incoming cookie header: ...
//   [CHECKPOINT-A] contains refreshToken: true/false
//   [CHECKPOINT-A] outgoing cookie header to backend: ...
//
// If "contains refreshToken" is FALSE here, the browser never sent it to
// Next.js in the first place (path/domain/sameSite mismatch on the cookie
// itself, or it's genuinely not in the jar despite what you see in
// DevTools' Application/Storage tab — DevTools' cookie list and what's
// actually attached to a given request can differ if path/domain don't
// match the request URL).
//
// If TRUE here but the outgoing header looks different/truncated, the bug
// is in this file's forwarding logic.
//
// REMOVE all CHECKPOINT-A logging once the bug is found — this logs full
// cookie values including the refresh token itself, which you do not want
// sitting in production logs.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import http from 'http';
import https from 'https';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://100.118.151.3:4001';
const UPSTREAM_TIMEOUT_MS = 300000;

const agentOptions = {
  keepAlive: true,
  family: 4,
  rejectUnauthorized: process.env.NODE_ENV === 'production',
};
const httpAgent = new http.Agent(agentOptions);
const httpsAgent = new https.Agent(agentOptions);

export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return handleRequest(request, path, 'GET');
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return handleRequest(request, path, 'POST');
}
export async function PUT(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return handleRequest(request, path, 'PUT');
}
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return handleRequest(request, path, 'DELETE');
}

async function handleRequest(request: NextRequest, path: string[] = [], method: string) {
  const pathStr = path.join('/');
  const isRefreshOrStatus = pathStr.includes('auth/refresh') || pathStr.includes('auth/status');

  const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
                 || request.ip
                 || 'unknown';
  const url = new URL(`${ADMIN_API_URL}/api/admin/${pathStr}`);
  url.search = request.nextUrl.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (
      !['host', 'connection', 'content-length', 'transfer-encoding',
         'x-forwarded-for', 'x-real-ip'].includes(key.toLowerCase())
    ) {
      headers.set(key, value);
    }
  });
  headers.set('X-Forwarded-For', clientIP);

  const incomingCookieHeader = request.headers.get('cookie');

  // ---- CHECKPOINT A ----
  if (isRefreshOrStatus) {
    console.log('[CHECKPOINT-A] path:', pathStr);
    console.log('[CHECKPOINT-A] incoming cookie header:', incomingCookieHeader);
    console.log(
      '[CHECKPOINT-A] contains refreshToken:',
      !!incomingCookieHeader?.includes('refreshToken=')
    );
  }
  // ---- END CHECKPOINT A (part 1) ----

  if (incomingCookieHeader) {
    headers.set('cookie', incomingCookieHeader);
  }

  // ---- CHECKPOINT A (part 2) ----
  if (isRefreshOrStatus) {
    console.log('[CHECKPOINT-A] outgoing cookie header to backend:', headers.get('cookie'));
  }
  // ---- END CHECKPOINT A (part 2) ----

  let body: BodyInit | undefined = undefined;
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    body = await request.arrayBuffer();
  } else if (method !== 'GET' && method !== 'HEAD') {
    body = await request.text();
  }

  const agent = url.protocol === 'https:' ? httpsAgent : httpAgent;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  // ---- CHECKPOINT A-EXTRA ----
  // Next.js route handlers use Node's built-in `fetch` (undici), which does
  // NOT reliably honor a raw http.Agent passed in the options object the
  // way node-fetch/axios do. If `agent` is silently ignored here, then
  // `family: 4` (force IPv4) and `rejectUnauthorized` are also silently
  // ignored. That matters because: if DNS resolution for ADMIN_API_URL's
  // host returns BOTH an IPv4 and IPv6 record (common on Tailscale, which
  // assigns both a 100.x IPv4 and an fd7a:... IPv6 per node) and undici
  // picks whichever happens to resolve/connect first per-request, you'd
  // get intermittent connection behavior that LOOKS like flakiness but is
  // actually "sometimes IPv6 path, sometimes IPv4 path" -- and one of
  // those paths could be broken/slow/blocked on your network while the
  // other works. This is a plausible single root cause for BOTH the
  // "refresh cookie not found" (if THIS request's leg silently fails or
  // routes somewhere unexpected) and the "login sometimes fails" (same
  // mechanism, different endpoint) symptoms, since both go through this
  // same proxy/fetch path to the same backend.
  //
  // This log block doesn't prove which path was used (undici doesn't
  // expose that easily), but logs total request time and host resolution
  // target so you can correlate against backend-side connection logs ON
  // SAME REQUEST. If you have control of the Express backend's listen
  // call, also log the remote address of the INCOMING socket
  // (req.socket.remoteAddress) at Checkpoint B time -- if you see a mix
  // of "100.x.x.x" and "fd7a:..." remote addresses across requests to the
  // SAME client, that confirms dual-stack inconsistency is in play.
  console.log('[CHECKPOINT-A-EXTRA] target URL host:', url.hostname, 'protocol:', url.protocol);
  // ---- END CHECKPOINT A-EXTRA ----

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body,
      agent,
      signal: controller.signal,
    } as any);

    const responseHeaders = new Headers(response.headers);
    const setCookieHeaders = response.headers.getSetCookie();
    for (const cookie of setCookieHeaders) {
      responseHeaders.append('set-cookie', cookie);
    }

    if (isRefreshOrStatus) {
      console.log('[CHECKPOINT-A] backend response status:', response.status);
      console.log('[CHECKPOINT-A] backend Set-Cookie headers:', setCookieHeaders);
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('[CHECKPOINT-A] Upstream fetch failed', {
      path: pathStr,
      method,
      reason: error?.name === 'AbortError' ? 'timeout' : (error?.code || error?.message),
    });
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}