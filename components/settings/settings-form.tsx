"use client";

import { Bot, LogOut, Settings2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { todayISO } from "@/lib/date";
import { renderReview } from "@/lib/template";
import type {
  AppSettings,
  ReviewDraft,
  ReviewStyle,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  initialSettings: AppSettings;
  aiModel: string;
  aiConfigured: boolean;
};

type ToggleKey =
  | "showJiaoyan"
  | "showKunnan"
  | "showFixedPhrase"
  | "enableMemory";

const SAMPLE_DRAFT: ReviewDraft = {
  sections: {
    xueqing: ["林小满：完成今日校内作业，错题已讲解。"],
    jiaoxiao: ["林小满妈妈（微信）：沟通今日作业完成情况。"],
    yeji: [],
    richang: ["服务再细致一些，多关注林小满的作业状态。"],
    xiaocheng: ["林小满的数学错题已录入小橙AI系统。"],
    kunnan: [],
    jiaoyan: ["参加学管部教研，讨论新生跟进节奏。"],
  },
  dailyPhrase:
    "临近期中，今天重点跟进了孩子们的复习和错题订正情况，也提前准备好了复习资料。后续会继续做好学情跟踪，及时把孩子的学习状态同步给家长，服务再细致一些，帮孩子们稳住基础、查漏补缺。",
  questions: [],
  notes: [],
};

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
    title: "固定话术",
    description: "每天根据当天内容生成一段服务/业绩话术，追加在末尾。",
  },
  {
    key: "enableMemory",
    title: "长期记忆",
    description:
      "每天最后一次复制时自动提取；生成时参考，关闭后不提取也不参考。",
  },
];

export function SettingsForm({
  initialSettings,
  aiModel,
  aiConfigured,
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
      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "退出失败");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="paper-card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-deep ring-2 ring-brand/40">
            <Settings2 className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-extrabold text-ink">复盘设置</h2>
        </div>

        <div className="mt-4 divide-y-2 divide-line/60">
          {TOGGLES.map((item) => (
            <div
              key={item.key}
              className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
            >
              <div>
                <div className="text-sm font-bold text-ink">
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

        <div className="mt-4 flex flex-col gap-3 border-t-2 border-line/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-bold text-ink">默认文风</div>
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

      <section className="paper-card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-deep ring-2 ring-brand/40">
            <Sparkles className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-extrabold text-ink">
            模板预览
          </h2>
        </div>

        <pre className="review-text mt-4 max-h-[360px] overflow-y-auto rounded-2xl bg-cream/40 p-4 text-[13px] text-ink ring-2 ring-line/60">
          {preview}
        </pre>
      </section>

      <section className="paper-card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-soft text-[#4e7f99] ring-2 ring-sky/60">
            <Bot className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-extrabold text-ink">
            AI 与账号
          </h2>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream-deep/60 px-3.5 py-3">
            <div className="text-sm text-ink-soft">
              模型：<span className="font-medium text-ink">{aiModel}</span>
            </div>
            <Badge tone={aiConfigured ? "green" : "red"}>
              {aiConfigured ? "Key 已配置" : "Key 未配置"}
            </Badge>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl bg-cream-deep/60 px-3.5 py-3">
            <div className="text-sm font-bold text-ink">退出登录</div>
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
        </div>
      </section>
    </div>
  );
}
