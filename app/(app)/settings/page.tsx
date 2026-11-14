import { UsagiMascot } from "@/components/mascots";
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
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeading
        title="设置"
        mascot={<UsagiMascot className="h-9 w-9" />}
      />
      <SettingsForm
        initialSettings={settings}
        aiModel={getAiModelName()}
        aiConfigured={isAiConfigured()}
      />
    </div>
  );
}
