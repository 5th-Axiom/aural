import { NextRequest, NextResponse } from "next/server";
import {
  TEST_ACCESS_COOKIE,
  testAccessEnabled,
  matchesTestPassword,
  issueTestAccess,
} from "@/lib/test-access";

export function GET() {
  if (!testAccessEnabled()) return new Response(null, { status: 404 });
  return new Response(
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aural 测试环境</title><body style="font-family:system-ui;background:#f5f3ef;padding:12vh 24px"><main style="max-width:360px;margin:auto"><h1>Aural 测试环境</h1><p>输入测试环境访问密码，随后使用手机号登录。</p><form method="post" action="/api/test-access"><input aria-label="访问密码" name="password" type="password" required autocomplete="current-password" style="box-sizing:border-box;width:100%;padding:12px"><button style="margin-top:16px;padding:12px;width:100%">进入项目</button></form></main></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      },
    },
  );
}
export async function POST(request: NextRequest) {
  if (!testAccessEnabled()) return new Response(null, { status: 404 });
  if (request.headers.get("origin") !== process.env.NEXT_PUBLIC_APP_URL)
    return new Response("Invalid origin", { status: 403 });
  const form = await request.formData();
  if (!matchesTestPassword(String(form.get("password") || "")))
    return new Response("密码不正确，请返回重试。", { status: 401 });
  const response = NextResponse.redirect(
    new URL("/login", process.env.NEXT_PUBLIC_APP_URL),
    303,
  );
  response.cookies.set(TEST_ACCESS_COOKIE, issueTestAccess(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 86400,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
