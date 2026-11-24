"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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

  /** 同栏目内上移 / 下移 */
  function shiftItem(section: SectionKey, index: number, offset: -1 | 1) {
    setLocal((previous) => {
      const items = previous.sections[section];
      const target = index + offset;
      if (target < 0 || target >= items.length) return previous;

      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];

      return {
        ...previous,
        sections: { ...previous.sections, [section]: next },
      };
    });
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
      <DialogContent title="调整内容" className="max-w-2xl">
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
                    <h3 className="text-sm font-semibold text-ink">
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
                  {items.map((item, index) => (
                    <div
                      key={`${key}-${index}`}
                      className="rounded-xl border border-line/70 bg-cream/60 p-2"
                    >
                      <Textarea
                        value={item}
                        onChange={(event) =>
                          updateItem(key, index, event.target.value)
                        }
                        rows={2}
                        className="min-h-[64px] bg-paper text-sm"
                      />
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="上移"
                              title="上移"
                              disabled={index === 0}
                              onClick={() => shiftItem(key, index, -1)}
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="下移"
                              title="下移"
                              disabled={index === items.length - 1}
                              onClick={() => shiftItem(key, index, 1)}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>

                          <Select
                            value=""
                            onChange={(event) => {
                              const target = event.target
                                .value as SectionKey;
                              if (target) moveItem(key, index, target);
                            }}
                            className="h-8 w-28 pl-2.5 pr-8 text-xs font-medium text-ink-soft"
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
                          </Select>
                        </div>

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

        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-6 flex justify-end gap-2 border-t border-line/70 bg-paper px-5 pb-5 pt-4 sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存修改</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
