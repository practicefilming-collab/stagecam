import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedRoute = request.nextUrl.pathname.startsWith('/(protected)') ||
    request.nextUrl.pathname.startsWith('/menu') ||
    request.nextUrl.pathname.startsWith('/stage') ||
    request.nextUrl.pathname.startsWith('/panel') ||
    request.nextUrl.pathname.startsWith('/history') ||
    request.nextUrl.pathname.startsWith('/stats') ||
    request.nextUrl.pathname.startsWith('/requests');

  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // If authenticated, check terms acceptance for protected routes
  if (isProtectedRoute && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('terms_accepted_at')
      .eq('id', user.id)
      .single();

    if (profile && !profile.terms_accepted_at && !request.nextUrl.pathname.startsWith('/terms')) {
      const url = request.nextUrl.clone();
      url.pathname = '/terms';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
