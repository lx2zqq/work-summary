import { PageHeading } from "@/components/page-heading";
import { SettingsForm } from "@/components/settings/settings-form";
import {
  getAiModelName,
  isAiConfigured,
} from "@/lib/ai/deepseek";
import { getSettings } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
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
