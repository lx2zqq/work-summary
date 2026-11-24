"use client";

import { useDemo } from "@/components/demo/demo-provider";
import { MemoryManager } from "@/components/memories/memory-manager";
import { PageHeading } from "@/components/page-heading";

export default function DemoMemoriesPage() {
  const { memories, students, settings, memoryStore } = useDemo();

  return (
    <div className="space-y-4">
      <PageHeading
        title="长期记忆"
        description="演示数据，可以增删改，刷新后恢复。"
      />
      <MemoryManager
        initialMemories={memories}
        students={students}
        memoryEnabled={settings.enableMemory}
        store={memoryStore}
      />
    </div>
  );
}
