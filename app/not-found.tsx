import Link from "next/link";
import { MascotTrio } from "@/components/mascots";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="app-bg flex min-h-dvh items-center justify-center px-4">
      <div className="paper-card w-full max-w-sm p-8 text-center">
        <MascotTrio className="scale-95" />
        <h1 className="mt-4 text-base font-semibold text-ink">
          这个页面不存在
        </h1>
        <Link href="/" className={buttonClass({ className: "mt-5" })}>
          返回工作台
        </Link>
      </div>
    </main>
  );
}
