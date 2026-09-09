import { createHmac, createHash } from "node:crypto";
import { z } from "zod";

// The mock deliberately accepts arbitrary nonempty phone identifiers this release.
export const phoneIdentifier = z
  .string()
  .trim()
  .min(1, "请输入手机号")
  .max(64, "手机号过长");
export const phoneLoginInput = z.object({
  phone: phoneIdentifier,
  code: z.literal("123456", { error: "验证码不正确，请输入 123456" }),
});
export function phoneCredentials(phone: string, secret: string) {
  if (secret.length < 32) throw new Error("未配置模拟登录密钥");
  const id = createHash("sha256").update(phone).digest("hex");
  return {
    email: `${id}@phone.aural.invalid`,
    password: createHmac("sha256", secret)
      .update(`phone-login:${phone}`)
      .digest("hex"),
  };
}
export function safeReturnPath(value: unknown) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\r\n]/.test(value)
    ? value
    : "/dashboard";
}
