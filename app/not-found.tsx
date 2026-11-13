import Link from "next/link";
import { MascotTrio } from "@/components/mascots";

export default function NotFound() {
  return (
    <main className="app-bg flex min-h-dvh items-center justify-center px-4">
      <div className="paper-card w-full max-w-sm p-8 text-center">
        <MascotTrio className="scale-95" />
        <h1 className="mt-4 text-xl font-extrabold text-ink">
          这个页面不存在
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          可能是链接输错了，回到今天的工作台吧。
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-10 items-center rounded-full border-2 border-cocoa bg-brand px-4 text-sm font-bold text-cocoa shadow-[0_3px_0_#5b463c] transition-all hover:-translate-y-0.5 hover:bg-[#f7b7c8] hover:shadow-[0_4px_0_#5b463c]"
        >
          返回工作台
        </Link>
      </div>
    </main>
  );
}
