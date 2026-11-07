import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// 로그인 없이 볼 수 있는 경로. 그 밖의 모든 페이지는 회원가입이 필요해요.
// /copyright 는 권리자(회원이 아닐 수 있음)가 저작권 침해를 신고하는 곳이라 열어둬요.
const PUBLIC_PATHS = ["/login", "/auth", "/copyright", "/legal"];

// 로그인은 했지만 닉네임·나이 확인을 아직 안 한 사람도 들어갈 수 있는 경로
const ONBOARDING_PATHS = ["/onboarding", ...PUBLIC_PATHS];

function matches(path: string, list: string[]) {
  return list.some((p) => path === p || path.startsWith(p + "/"));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser()는 세션을 확인하면서 만료된 토큰을 갱신해요. 이 호출을 지우지 마세요.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // API는 각 라우트에서 직접 로그인 여부를 확인하고 401을 돌려줘요.
  if (path.startsWith("/api")) return response;

  if (!user && !matches(path, PUBLIC_PATHS)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && !matches(path, ONBOARDING_PATHS)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("nickname, age_confirmed")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.nickname || !profile.age_confirmed) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
