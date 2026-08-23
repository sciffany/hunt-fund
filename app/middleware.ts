import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const publicPaths = new Set(["/", "/login"]);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/ingest")) {
    return NextResponse.next();
  }

  const isAuthed = Boolean(req.auth?.user);
  const isPublic = publicPaths.has(pathname);

  if (!isAuthed && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
