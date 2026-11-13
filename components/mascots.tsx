import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MascotMood = "happy" | "sad";

type MascotProps = {
  className?: string;
  title?: string;
  mood?: MascotMood;
};

const CHIIKAWA: Record<MascotMood, string> = {
  happy: "/mascots/chiikawa-happy.png",
  sad: "/mascots/chiikawa-sad.png",
};

const HACHIWARE: Record<MascotMood, string> = {
  happy: "/mascots/hachiware-happy.png",
  sad: "/mascots/hachiware-sad.png",
};

const USAGI: Record<MascotMood, string> = {
  happy: "/mascots/usagi-happy.png",
  sad: "/mascots/usagi-sad.png",
};

function MascotImage({
  src,
  className,
  title,
}: {
  src: string;
  className?: string;
  title?: string;
}) {
  return (
    <Image
      src={src}
      alt={title ?? ""}
      width={512}
      height={512}
      draggable={false}
      loading="eager"
      aria-hidden={title ? undefined : true}
      className={cn(
        "block h-16 w-16 select-none object-contain",
        className,
      )}
    />
  );
}

export function ChiikawaMascot({
  className,
  title,
  mood = "happy",
}: MascotProps) {
  return (
    <MascotImage
      src={CHIIKAWA[mood]}
      className={className}
      title={title}
    />
  );
}

export function HachiwareMascot({
  className,
  title,
  mood = "happy",
}: MascotProps) {
  return (
    <MascotImage
      src={HACHIWARE[mood]}
      className={className}
      title={title}
    />
  );
}

export function UsagiMascot({
  className,
  title,
  mood = "happy",
}: MascotProps) {
  return (
    <MascotImage
      src={USAGI[mood]}
      className={className}
      title={title}
    />
  );
}

export function MascotTrio({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-end justify-center", className)}>
      <HachiwareMascot className="h-16 w-16 -rotate-6" />
      <ChiikawaMascot className="mascot-float relative z-10 -mx-2 h-24 w-24" />
      <UsagiMascot className="h-20 w-20 rotate-6" />
    </div>
  );
}

export function MascotFace({ className }: { className?: string }) {
  return <ChiikawaMascot className={cn("h-9 w-9", className)} />;
}

export function SpeechBubble({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border-2 border-line bg-paper px-3.5 py-2 text-xs font-bold text-ink shadow-[0_3px_0_#eadccd]",
        className,
      )}
    >
      {children}
      <span className="absolute -bottom-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-line bg-paper" />
    </div>
  );
}

export function DoodleStar({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("block", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 L13.6 9.4 L20 11 L13.6 12.6 L12 19 L10.4 12.6 L4 11 L10.4 9.4 Z" />
    </svg>
  );
}

export function DoodleHeart({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("block", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20 C7 16 4 13.5 4 10.5 C4 7.5 6 6 8.5 6 C10 6 11.3 7 12 8.2 C12.7 7 14 6 15.5 6 C18 6 20 7.5 20 10.5 C20 13.5 17 16 12 20 Z" />
    </svg>
  );
}
