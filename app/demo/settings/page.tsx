"use client";

import { useMemo } from "react";
import { useDemo } from "@/components/demo/demo-provider";
import { PageHeading } from "@/components/page-heading";
import { SettingsForm } from "@/components/settings/settings-form";
import { DEMO_AI_MODEL } from "@/lib/demo-data";

export default function DemoSettingsPage() {
  const { settings, updateSettings } = useDemo();

  const store = useMemo(
    () => ({ update: updateSettings }),
    [updateSettings],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeading
        title="设置"
        description="演示数据，改动会立即影响今日复盘的渲染。"
      />
      <SettingsForm
        initialSettings={settings}
        aiModel={DEMO_AI_MODEL}
        aiConfigured
        store={store}
        demoMode
      />
    </div>
  );
}
