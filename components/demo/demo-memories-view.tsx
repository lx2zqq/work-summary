"use client";

import { useDemo } from "@/components/demo/demo-provider";
import { MemoryManager } from "@/components/memories/memory-manager";
import { PageHeading } from "@/components/page-heading";

export function DemoMemoriesView() {
  const { memories, students, settings, memoryStore } = useDemo();

  return (
    <div className="space-y-4">
      <PageHeading title="长期记忆" />
      <MemoryManager
        initialMemories={memories}
        students={students}
        memoryEnabled={settings.enableMemory}
        store={memoryStore}
      />
    </div>
  );
}
