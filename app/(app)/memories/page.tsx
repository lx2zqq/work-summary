import { PageHeading } from "@/components/page-heading";
import { MemoryManager } from "@/components/memories/memory-manager";
import { requireSession } from "@/lib/auth";
import {
  getSettings,
  listMemories,
  listStudents,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function MemoriesPage() {
  // 查询之前先鉴权：layout 和 page 是并行渲染的，不能只依赖 layout
  await requireSession();

  // 串行读取，避免 Supabase 连接池在并发查询时卡住
  const memories = await listMemories();
  const students = await listStudents();
  const settings = await getSettings();

  return (
    <div className="space-y-4">
      <PageHeading title="长期记忆" />
      <MemoryManager
        initialMemories={memories}
        students={students}
        memoryEnabled={settings.enableMemory}
      />
    </div>
  );
}
