import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/sign-in', '/sign-up']
const AUTH_COOKIE_NAME = 'better-auth.session_token'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static assets and auth API
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const hasSession = request.cookies.has(AUTH_COOKIE_NAME)
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  if (!hasSession && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    return NextResponse.redirect(url)
  }

  if (hasSession && isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
