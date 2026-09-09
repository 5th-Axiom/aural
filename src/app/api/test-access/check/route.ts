import { NextRequest } from "next/server";
import { TEST_ACCESS_COOKIE, validTestAccess } from "@/lib/test-access";
export function GET(request: NextRequest) {
  return new Response(null, { status: validTestAccess(request.cookies.get(TEST_ACCESS_COOKIE)?.value) ? 204 : 401 });
}
