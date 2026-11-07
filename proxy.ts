import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16부터 middleware.ts 대신 proxy.ts를 써요.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sdk.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
