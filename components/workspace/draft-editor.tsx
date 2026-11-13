"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { normalizeDraft } from "@/lib/draft";
import {
  SECTION_META,
  SECTION_ORDER,
  type AppSettings,
  type ReviewDraft,
  type SectionKey,
} from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ReviewDraft;
  settings: AppSettings;
  onSave: (draft: ReviewDraft) => void;
};

export function DraftEditor(props: Props) {
  if (!props.open) return null;
  return <DraftEditorInner {...props} />;
}

function DraftEditorInner({
  onOpenChange,
  draft,
  settings,
  onSave,
}: Omit<Props, "open">) {
  // 每次打开都重新挂载，直接以当前草稿作为初始值
  const [local, setLocal] = useState<ReviewDraft>(() =>
    structuredClone(draft),
  );

  function updateItem(section: SectionKey, index: number, value: string) {
    setLocal((previous) => ({
      ...previous,
      sections: {
        ...previous.sections,
        [section]: previous.sections[section].map((item, itemIndex) =>
          itemIndex === index ? value : item,
        ),
      },
    }));
  }

  function removeItem(section: SectionKey, index: number) {
    setLocal((previous) => ({
      ...previous,
      sections: {
        ...previous.sections,
        [section]: previous.sections[section].filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      },
    }));
  }

  function addItem(section: SectionKey) {
    setLocal((previous) => ({
      ...previous,
      sections: {
        ...previous.sections,
        [section]: [...previous.sections[section], ""],
      },
    }));
  }

  function moveItem(
    from: SectionKey,
    index: number,
    to: SectionKey,
  ) {
    if (from === to) return;

    setLocal((previous) => {
      const item = previous.sections[from][index];
      if (item === undefined) return previous;

      return {
        ...previous,
        sections: {
          ...previous.sections,
          [from]: previous.sections[from].filter(
            (_, itemIndex) => itemIndex !== index,
          ),
          [to]: [...previous.sections[to], item],
        },
      };
    });
  }

  function handleSave() {
    const next = normalizeDraft(local, {
      maxQuestions: local.questions.length,
    });
    onSave(next);
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        title="调整内容"
        description="逐条修改、移动或删除；保存后正文会同步更新。"
        className="max-w-2xl"
      >
        <div className="mt-4 space-y-5">
          {SECTION_ORDER.map((key) => {
            const items = local.sections[key] ?? [];
            const optionalHidden =
              (key === "kunnan" && !settings.showKunnan) ||
              (key === "jiaoyan" && !settings.showJiaoyan);

            return (
              <div key={key}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-extrabold text-ink">
                      {SECTION_META[key].title}
                    </h3>
                    <span className="text-[11px] text-ink-soft/70">
                      {items.length} 条
                    </span>
                    {optionalHidden ? (
                      <Badge tone="amber">栏目未开启，正文不显示</Badge>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addItem(key)}
                  >
                    <Plus className="h-4 w-4" />
                    添加
                  </Button>
                </div>

                <div className="mt-2 space-y-2">
                  {items.length === 0 ? (
                    <p className="rounded-2xl bg-cream-deep/60 px-3 py-2 text-xs text-ink-soft">
                      暂无内容
                    </p>
                  ) : null}

                  {items.map((item, index) => (
                    <div
                      key={`${key}-${index}`}
                      className="rounded-2xl border-2 border-line/60 bg-cream/60 p-2"
                    >
                      <Textarea
                        value={item}
                        onChange={(event) =>
                          updateItem(key, index, event.target.value)
                        }
                        rows={2}
                        className="min-h-[64px] bg-paper text-sm"
                      />
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <select
                          value=""
                          onChange={(event) => {
                            const target = event.target.value as SectionKey;
                            if (target) moveItem(key, index, target);
                          }}
                          className="h-8 rounded-full border-2 border-line bg-paper px-2.5 text-xs font-semibold text-ink-soft outline-none focus:border-brand-deep"
                          aria-label="移动到其他栏目"
                        >
                          <option value="">移动到…</option>
                          {SECTION_ORDER.filter(
                            (sectionKey) => sectionKey !== key,
                          ).map((sectionKey) => (
                            <option key={sectionKey} value={sectionKey}>
                              {SECTION_META[sectionKey].title}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => removeItem(key, index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t-2 border-line/60 pt-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存修改</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
