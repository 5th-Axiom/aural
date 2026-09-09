"use client";
import { useUiTranslation } from "@/hooks/use-ui-translation";
import { useState } from "react";
import { AuralLogo } from "@/components/ui/aural-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppLocale } from "@/components/app-locale-provider";
import { Loader2 } from "lucide-react";

export function LoginForm() {
  const ui = useUiTranslation();
  const { locale } = useAppLocale();
  const zh = locale === "zh";
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || (zh ? "登录失败" : "Login failed"));
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(
        next?.startsWith("/") &&
          !next.startsWith("//") &&
          !/[\\\r\n]/.test(next)
          ? next
          : "/dashboard",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : zh
            ? "网络异常，请重试"
            : "Network error. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader className="text-center">
        <AuralLogo size={56} className="mx-auto mb-2" />
        <CardTitle>{zh ? "手机号登录" : ui("Phone login")}</CardTitle>
        <CardDescription>
          {zh
            ? "首次登录将自动创建账号"
            : ui("Your account is created on first login")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="phone">{zh ? "手机号" : ui("Phone number")}</Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setSent(false);
              }}
              maxLength={64}
              required
              placeholder={zh ? "请输入手机号" : ui("Enter your phone number")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">
              {zh ? "短信验证码" : ui("Verification code")}
            </Label>
            <div className="flex gap-2">
              <Input
                id="code"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!phone.trim() || busy}
                onClick={() => {
                  setSent(true);
                  setError("");
                }}
              >
                {zh ? "获取验证码" : ui("Get code")}
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground" role="status">
            {zh
              ? sent
                ? "模拟验证码已生成：123456，无需接收短信。"
                : "本期为模拟登录：手机号可任意填写，验证码固定为 123456。"
              : ui(
                  "Demo login: use any phone number and code 123456. No SMS is sent.",
                )}
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            className="w-full"
            disabled={busy || !phone.trim() || code.length !== 6}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {zh ? "登录 / 注册" : ui("Sign in / Sign up")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
