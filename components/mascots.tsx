import Image from "next/image";
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
      <ChiikawaMascot className="relative z-10 -mx-2 h-24 w-24" />
      <UsagiMascot className="h-20 w-20 rotate-6" />
    </div>
  );
}

export function MascotFace({ className }: { className?: string }) {
  return <ChiikawaMascot className={cn("h-9 w-9", className)} />;
}
