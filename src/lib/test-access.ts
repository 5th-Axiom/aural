import { createHmac, timingSafeEqual } from "node:crypto";

export const TEST_ACCESS_COOKIE = "aural-test-access";
export function testAccessEnabled() {
  return process.env.TEST_ACCESS_ENABLED === "true" && !!process.env.TEST_ACCESS_SECRET;
}
export function matchesTestPassword(input: string) {
  const expected = process.env.TEST_ACCESS_PASSWORD;
  if (!expected || !input) return false;
  const hash = (value: string) => createHmac("sha256", process.env.TEST_ACCESS_SECRET || "").update(value).digest();
  return timingSafeEqual(hash(input), hash(expected));
}
export function issueTestAccess() {
  const expires = String(Math.floor(Date.now() / 1000) + 86400);
  return `${expires}.${createHmac("sha256", process.env.TEST_ACCESS_SECRET!).update(expires).digest("hex")}`;
}
export function validTestAccess(value?: string) {
  if (!testAccessEnabled() || !value) return false;
  const [expires, signature, extra] = value.split(".");
  if (extra || !/^\d+$/.test(expires) || !/^[a-f0-9]{64}$/.test(signature || "") || Number(expires) <= Date.now() / 1000) return false;
  const expected = createHmac("sha256", process.env.TEST_ACCESS_SECRET!).update(expires).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
