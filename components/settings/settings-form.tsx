"use client";

import { Bot, FileText, LogOut, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataBackup } from "@/components/settings/data-backup";
import { PhraseLibrary } from "@/components/settings/phrase-library";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { todayISO } from "@/lib/date";
import { resetGenerationStore } from "@/lib/generation-store";
import { SAMPLE_DRAFT } from "@/lib/sample";
import { renderReview } from "@/lib/template";
import type { AppSettings, ReviewStyle } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 演示模式用内存实现；生产不传，走接口 */
export type SettingsStore = {
  update: (patch: Partial<AppSettings>) => Promise<AppSettings>;
};

type Props = {
  initialSettings: AppSettings;
  aiModel: string;
  aiConfigured: boolean;
  store?: SettingsStore;
  /** 演示模式：隐藏退出登录，改成回登录页 */
  demoMode?: boolean;
};

type ToggleKey =
  | "showJiaoyan"
  | "showKunnan"
  | "showFixedPhrase"
  | "enableMemory";

const TOGGLES: Array<{
  key: ToggleKey;
  title: string;
  description: string;
}> = [
  {
    key: "showJiaoyan",
    title: "教研相关",
    description: "有教研内容时显示。",
  },
  {
    key: "showKunnan",
    title: "工作困难",
    description: "当天没内容时自动补一句“目前没有困难”。",
  },
  {
    key: "showFixedPhrase",
    title: "通用复盘话术",
    description: "每天在【日常工作复盘】后自动补 3 条，按当天主题轮换。",
  },
  {
    key: "enableMemory",
    title: "长期记忆",
    description:
      "从复盘正文提取长期记忆，生成时参考；关闭后不提取也不参考。",
  },
];

export function SettingsForm({
  initialSettings,
  aiModel,
  aiConfigured,
  store,
  demoMode = false,
}: Props) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const preview = useMemo(
    () => renderReview(SAMPLE_DRAFT, todayISO(), settings),
    [settings],
  );

  async function update(patch: Partial<AppSettings>) {
    const previous = settings;
    setSettings((current) => ({ ...current, ...patch }));
    setPendingKey(Object.keys(patch)[0] ?? "settings");

    try {
      if (store) {
        setSettings(await store.update(patch));
        toast.success("设置已保存（演示，刷新后恢复默认）");
        return;
      }

      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        settings?: AppSettings;
      };

      if (!response.ok) {
        throw new Error(data.error || "保存失败");
      }

      if (data.settings) setSettings(data.settings);
      toast.success("设置已保存");
    } catch (error) {
      setSettings(previous);
      toast.error(
        error instanceof Error ? error.message : "设置保存失败",
      );
    } finally {
      setPendingKey(null);
    }
  }

  function toggle(key: ToggleKey, checked: boolean) {
    void update({ [key]: checked } as Partial<AppSettings>);
  }

  function changeDefaultStyle(style: ReviewStyle) {
    void update({ defaultStyle: style });
  }

  async function handleLogout() {
    setLoggingOut(true);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("退出失败，请重试");
      resetGenerationStore();
      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "退出失败");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr] lg:items-start">
      <div className="space-y-4">
        <section className="paper-card p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-deep">
              <Settings2 className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold text-ink">复盘设置</h2>
          </div>

          <div className="mt-4 divide-y divide-line/60">
            {TOGGLES.map((item) => (
              <div
                key={item.key}
                className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
              >
                <div>
                  <div className="text-sm font-medium text-ink">
                    {item.title}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                    {item.description}
                  </p>
                </div>
                <Switch
                  checked={settings[item.key]}
                  onCheckedChange={(checked) => toggle(item.key, checked)}
                  disabled={pendingKey !== null}
                  aria-label={item.title}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-line/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium text-ink">默认文风</div>
            <div
              className={cn(
                "shrink-0",
                pendingKey !== null && "pointer-events-none opacity-50",
              )}
            >
              <Segmented
                options={[
                  { value: "concise", label: "简洁" },
                  { value: "detailed", label: "详细" },
                ]}
                value={settings.defaultStyle}
                onChange={changeDefaultStyle}
                ariaLabel="默认文风"
              />
            </div>
          </div>

          {pendingKey ? (
            <p className="mt-3 text-right text-[11px] text-ink-soft">
              保存中…
            </p>
          ) : null}
        </section>

        <PhraseLibrary
          initialPhrases={settings.customPhrases}
          demoMode={demoMode}
          onPhrasesChange={(phrases) =>
            setSettings((current) => ({ ...current, customPhrases: phrases }))
          }
        />

        <section className="paper-card p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-soft text-[#4e7f99]">
              <Bot className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold text-ink">模型与账号</h2>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cream-deep/60 px-3.5 py-3">
              <div className="text-sm text-ink-soft">
                模型：<span className="font-medium text-ink">{aiModel}</span>
              </div>
              <Badge tone={aiConfigured ? "green" : "red"}>
                {aiConfigured ? "Key 已配置" : "Key 未配置"}
              </Badge>
            </div>

            {demoMode ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-cream-deep/60 px-3.5 py-3">
                <div className="text-sm font-medium text-ink">去真实环境</div>
                <Link
                  href="/login"
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  去登录
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-cream-deep/60 px-3.5 py-3">
                <div className="text-sm font-medium text-ink">退出登录</div>
                <Button
                  variant="danger"
                  size="sm"
                  loading={loggingOut}
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  退出
                </Button>
              </div>
            )}
          </div>
        </section>

        <DataBackup demoMode={demoMode} />
      </div>

      <div className="lg:sticky lg:top-20">
        <section className="paper-card p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-deep">
              <FileText className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold text-ink">模板预览</h2>
          </div>

          <pre className="review-text mt-4 rounded-xl bg-cream/60 p-4 text-[13px] text-ink ring-1 ring-line/70">
            {preview}
          </pre>
        </section>
      </div>
    </div>
  );
}
