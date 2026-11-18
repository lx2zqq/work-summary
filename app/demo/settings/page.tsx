"use client";

import { useMemo } from "react";
import { useDemo } from "@/components/demo/demo-provider";
import { UsagiMascot } from "@/components/mascots";
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
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeading
        title="设置"
        description="演示数据，改动会立即影响今日复盘的渲染。"
        mascot={<UsagiMascot className="h-9 w-9" />}
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
