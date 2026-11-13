"use client";

import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password.trim()) {
      setError("先输入访问密码");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setError(data.error || "登录失败，请重试");
        return;
      }

      toast.success("欢迎回来");
      // 登录态是服务端 HttpOnly Cookie，整页跳转能确保浏览器先保存 Cookie，
      // 也避免 Next 客户端路由缓存让服务端看起来还没登录。
      window.location.replace(next);
    } catch {
      setError("网络好像不太顺，再试一次");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">访问密码</Label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/60" />
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入密码"
            autoComplete="current-password"
            autoFocus
            className="pl-10"
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-2xl border-2 border-[#e4b1b1] bg-[#fde8e8] px-3 py-2.5 text-sm font-semibold leading-relaxed text-[#b35454]">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        进入
      </Button>
    </form>
  );
}
