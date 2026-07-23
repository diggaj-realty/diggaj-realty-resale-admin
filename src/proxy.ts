import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

const LISTING_SUBDOMAIN = 'list.diggajrealty.com'

export function proxy(request: NextRequest) {
  const host = request.headers.get('host') || ''

  /** list.diggajrealty.com is a dedicated custom domain on this same Vercel
   *  project (added directly, not proxied from another zone) so the public
   *  no-signup listing form can be reached without the flaky cross-project
   *  rewrite that diggajrealty.com/list-property used to depend on. */
  if (host === LISTING_SUBDOMAIN && request.nextUrl.pathname === '/') {
    return NextResponse.rewrite(new URL('/embed/list-property', request.url))
  }

  if (!request.nextUrl.pathname.startsWith('/api/v1/')) {
    return NextResponse.next()
  }

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders() })
  }

  const response = NextResponse.next()
  for (const [key, value] of Object.entries(corsHeaders())) {
    response.headers.set(key, value)
  }
  return response
}

export const config = {
  matcher: ['/api/v1/:path*', '/'],
}
