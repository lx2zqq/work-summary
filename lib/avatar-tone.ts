/** 低饱和莫兰迪色板，按完整姓名哈希，避免同姓撞色 */
const TONES = [
  "bg-[#E8DCD2] text-[#7A5C4A]",
  "bg-[#DCE3DA] text-[#566B58]",
  "bg-[#DFE1EA] text-[#5B6178]",
  "bg-[#EDE0D6] text-[#8A6152]",
  "bg-[#E3DDE6] text-[#6B5A72]",
  "bg-[#DDE6E8] text-[#4F6A70]",
  "bg-[#E9E2D0] text-[#7A6A45]",
  "bg-[#E6DEDE] text-[#75605F]",
];

export function avatarTone(name: string): string {
  let hash = 0;

  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }

  return TONES[hash % TONES.length];
}
