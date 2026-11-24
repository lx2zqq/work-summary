import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { MascotFace } from "@/components/mascots";
import { getSession } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const { next } = await searchParams;
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <main className="app-bg flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft ring-1 ring-line">
            <MascotFace className="h-10 w-10" />
          </span>
        </div>

        <div className="mt-4 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            学管复盘助手
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            每日工作复盘整理工具
          </p>
        </div>

        <div className="paper-card mt-6 p-6">
          <LoginForm next={safeNext} />
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/demo"
            className="inline-flex items-center gap-1 text-sm text-ink-soft transition-colors hover:text-brand-deep hover:underline hover:underline-offset-4"
          >
            进入演示模式
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
