import { PageHeading } from "@/components/page-heading";
import { SettingsForm } from "@/components/settings/settings-form";
import { requireSession } from "@/lib/auth";
import {
  getAiModelName,
  isAiConfigured,
} from "@/lib/ai/deepseek";
import { getSettings } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // 查询之前先鉴权：layout 和 page 是并行渲染的，不能只依赖 layout
  await requireSession();

  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeading title="设置" />
      <SettingsForm
        initialSettings={settings}
        aiModel={getAiModelName()}
        aiConfigured={isAiConfigured()}
      />
    </div>
  );
}
