import { UsagiMascot } from "@/components/mascots";
import { PageHeading } from "@/components/page-heading";
import { MemoryManager } from "@/components/memories/memory-manager";
import {
  getSettings,
  listMemories,
  listStudents,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function MemoriesPage() {
  // 串行读取，避免 Supabase 连接池在并发查询时卡住
  const memories = await listMemories();
  const students = await listStudents();
  const settings = await getSettings();

  return (
    <div className="space-y-4">
      <PageHeading
        title="长期记忆"
        description="AI 从每天的最终复盘里提取的关键信息。可以编辑或删除，生成复盘时会自动参考。"
        mascot={<UsagiMascot className="h-9 w-9" />}
      />
      <MemoryManager
        initialMemories={memories}
        students={students}
        memoryEnabled={settings.enableMemory}
      />
    </div>
  );
}
