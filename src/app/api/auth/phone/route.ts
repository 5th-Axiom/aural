import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { phoneCredentials, phoneLoginInput } from "@/lib/phone-auth";
import { checkRateLimit } from "@/lib/api-rate-limit";

export async function POST(request: NextRequest) {
  if (process.env.MOCK_PHONE_AUTH_ENABLED !== "true")
    return NextResponse.json(
      { error: "模拟手机号登录未启用" },
      { status: 404 },
    );
  const limit = checkRateLimit(
    `phone:${request.headers.get("x-forwarded-for")?.split(",")[0] || "local"}`,
  );
  if (limit) return limit;
  const parsed = phoneLoginInput.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  try {
    const { phone } = parsed.data;
    const credentials = phoneCredentials(
      phone,
      process.env.MOCK_PHONE_AUTH_SECRET || "",
    );
    const client = await createClient();
    let login = await client.auth.signInWithPassword(credentials);
    if (login.error) {
      // Deterministic credentials make concurrent first logins converge on one account.
      const created = await supabaseAdmin.auth.admin.createUser({
        ...credentials,
        email_confirm: true,
        app_metadata: { phone, auth_method: "mock_phone" },
        user_metadata: {
          phone,
          full_name: `用户 ${phone}`,
          auth_method: "mock_phone",
        },
      });
      if (
        created.error &&
        !["email_exists", "user_already_exists"].includes(
          created.error.code || "",
        )
      )
        return NextResponse.json(
          { error: "暂时无法创建账号，请稍后重试" },
          { status: 503 },
        );
      login = await client.auth.signInWithPassword(credentials);
    }
    if (login.error || !login.data.user)
      return NextResponse.json(
        { error: "登录失败，请稍后重试" },
        { status: 503 },
      );
    const profile = await supabaseAdmin
      .from("profiles")
      .update({ phone })
      .eq("id", login.data.user.id);
    if (profile.error)
      return NextResponse.json(
        { error: "手机号保存失败，请重试" },
        { status: 503 },
      );
    return NextResponse.json(
      { phone },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "登录服务暂时不可用，请稍后重试" },
      { status: 503 },
    );
  }
}

export async function GET() {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  return NextResponse.json(
    { phone: user?.app_metadata?.phone ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
