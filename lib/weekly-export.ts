import path from "node:path";
import ExcelJS from "exceljs";
import type { WeeklyReportContent, WeeklyReportMeta } from "./types";

const TEMPLATE_SHEET = "Sheet1";
const TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "weekly-report-template.xlsx",
);

/** C:N 合并后的可用宽度，按默认列宽 9 估算；中文字符按 2 个宽度计 */
const CHARS_PER_LINE = 52;
const LINE_HEIGHT = 16;
const ROW_PADDING = 4;
const DEFAULT_ROW_HEIGHT = 14;
const MAX_ROW_HEIGHT = 409;

type CellRange = {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
};

function columnLettersToNumber(letters: string): number {
  let result = 0;

  for (const char of letters) {
    result = result * 26 + (char.charCodeAt(0) - 64);
  }

  return result;
}

function parseRange(range: string): CellRange | null {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
  if (!match) return null;

  return {
    startCol: columnLettersToNumber(match[1]),
    startRow: Number(match[2]),
    endCol: columnLettersToNumber(match[3]),
    endRow: Number(match[4]),
  };
}

function rangesOverlap(a: CellRange, b: CellRange): boolean {
  return (
    a.startCol <= b.endCol &&
    b.startCol <= a.endCol &&
    a.startRow <= b.endRow &&
    b.startRow <= a.endRow
  );
}

/** 已经存在相同或相交的合并区域时跳过，避免 ExcelJS 抛“already merged” */
function mergeIfNeeded(
  worksheet: ExcelJS.Worksheet,
  range: string,
): void {
  const target = parseRange(range);
  if (!target) return;

  const overlaps = (worksheet.model.merges ?? []).some((existing) => {
    const parsed = parseRange(existing);
    return parsed ? rangesOverlap(parsed, target) : existing === range;
  });

  if (!overlaps) worksheet.mergeCells(range);
}

function isWideChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;

  return (
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

function displayWidth(value: string): number {
  let width = 0;

  for (const char of value) {
    width += isWideChar(char) ? 2 : 1;
  }

  return width;
}

function estimateLineCount(text: string, charsPerLine: number): number {
  return text.split(/\r?\n/).reduce((total, line) => {
    return total + Math.max(1, Math.ceil(displayWidth(line) / charsPerLine));
  }, 0);
}

function readRowHeight(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
): number {
  return worksheet.getRow(rowNumber).height || DEFAULT_ROW_HEIGHT;
}

/**
 * Excel 不会自动调整合并单元格的行高，这里按内容估算需要的总高度。
 * 合并区域的高度是块内所有行之和；用量块内真实行高计算，
 * 避免模板某一行本身较高时把锚点行撑出多余空白。
 */
export function fitRowHeight(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  text: string,
  blockRows = 1,
): void {
  if (!text) return;

  const lines = estimateLineCount(text, CHARS_PER_LINE);
  const needed = lines * LINE_HEIGHT + ROW_PADDING;

  let blockCapacity = 0;
  let otherRowsHeight = 0;

  for (let offset = 0; offset < blockRows; offset += 1) {
    const height = readRowHeight(worksheet, rowNumber + offset);
    blockCapacity += height;
    if (offset > 0) otherRowsHeight += height;
  }

  if (needed <= blockCapacity) return;

  const row = worksheet.getRow(rowNumber);
  const current = readRowHeight(worksheet, rowNumber);
  const target = Math.min(
    MAX_ROW_HEIGHT,
    Math.max(current, needed - otherRowsHeight),
  );

  if (target > current) row.height = target;
}

function enableWrapText(
  worksheet: ExcelJS.Worksheet,
  address: string,
): void {
  const cell = worksheet.getCell(address);
  cell.alignment = { ...cell.alignment, wrapText: true };
}

/** 读取模板并写入周报，返回可以直接下载的 xlsx Buffer */
export async function buildWeeklyReportXlsx(
  content: WeeklyReportContent,
  meta: WeeklyReportMeta,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.readFile(TEMPLATE_PATH);
  } catch (error) {
    throw new Error(`周报模板读取失败：${TEMPLATE_PATH}`, { cause: error });
  }

  const worksheet = workbook.getWorksheet(TEMPLATE_SHEET);
  if (!worksheet) {
    throw new Error(`周报模板缺少工作表 ${TEMPLATE_SHEET}`);
  }

  workbook.title = `周报 ${meta.weekStart} 至 ${meta.weekEnd}`;
  workbook.subject = "学管周报";
  workbook.creator = "work-summary";

  const cellText: Record<string, string> = {
    C3: `面谈：\n${content.summary.miantan || "无"}\n\n微信：\n${content.summary.weixin || "无"}`,
    C17: `请假：${content.metrics.qingjia || "无"}`,
    C18: `预警名单：${content.metrics.yujing || "无"}`,
    C19: `停课名单：${content.metrics.tingke || "无"}`,
    C20: `结课名单：${content.metrics.jieke || "无"}`,
    C21: `扩科：${content.metrics.kuoke || "无"}`,
    C22: `新签：${content.metrics.xinqian || "无"}`,
    C23: `续费：${content.metrics.xufei || "无"}`,
    C24: `在读学员年级及人数：\n${content.metrics.activeStudentsByGrade || "暂无"}`,
    C31: content.reflection || "",
    C32: `重点回访：${content.nextWeek.zhongdianHuifang || "无"}`,
    C33: `家长会：${content.nextWeek.jiazhanghui || "无"}`,
    C34: content.supportNeeded || "暂无",
  };

  for (const [address, value] of Object.entries(cellText)) {
    worksheet.getCell(address).value = value;
  }

  // 模板 J20 有一个孤立的“：”，先清空再合并，避免残留字符
  worksheet.getCell("J20").value = null;

  for (let row = 17; row <= 23; row += 1) {
    mergeIfNeeded(worksheet, `C${row}:N${row}`);
  }

  const rowHeights: Array<[row: number, text: string, blockRows: number]> = [
    [3, cellText.C3, 14],
    [17, cellText.C17, 1],
    [18, cellText.C18, 1],
    [19, cellText.C19, 1],
    [20, cellText.C20, 1],
    [21, cellText.C21, 1],
    [22, cellText.C22, 1],
    [23, cellText.C23, 1],
    [24, cellText.C24, 7],
    [31, cellText.C31, 1],
    [32, cellText.C32, 1],
    [33, cellText.C33, 1],
    [34, cellText.C34, 3],
  ];

  for (const [row, text, blockRows] of rowHeights) {
    enableWrapText(worksheet, `C${row}`);
    fitRowHeight(worksheet, row, text, blockRows);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
