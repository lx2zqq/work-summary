import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import {
  DoodleHeart,
  DoodleStar,
  MascotTrio,
  SpeechBubble,
} from "@/components/mascots";
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
        <div className="relative mx-auto flex w-fit flex-col items-center">
          <SpeechBubble className="relative z-10 mb-[-4px] rotate-[-2deg]">
            今天也辛苦啦
          </SpeechBubble>
          <MascotTrio className="pt-1" />
        </div>

        <div className="mt-2 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            学管复盘助手
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            把今天的流水账，整理成可以直接发钉钉的复盘。
          </p>
        </div>

        <div className="paper-card relative mt-6 p-6">
          <span className="washi-tape" />
          <LoginForm next={safeNext} />
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/demo"
            className="text-sm font-bold text-brand-deep underline underline-offset-4 hover:text-brand"
          >
            先看看效果，不用密码
          </Link>
        </div>

        <div className="mt-5 flex justify-center gap-2 text-brand/60">
          <DoodleStar className="h-3.5 w-3.5" />
          <DoodleHeart className="h-3.5 w-3.5" />
          <DoodleStar className="h-3.5 w-3.5" />
        </div>
      </div>
    </main>
  );
}
