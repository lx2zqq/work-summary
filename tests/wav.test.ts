import { describe, expect, it } from "vitest";
import {
  ASR_SAMPLE_RATE,
  downsample,
  encodeWav16kMono,
  isWavHeader,
  mergeChunks,
} from "@/lib/audio/wav";

function readAscii(view: DataView, offset: number, length: number): string {
  let text = "";

  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(view.getUint8(offset + index));
  }

  return text;
}

describe("isWavHeader", () => {
  it("接受标准 RIFF/WAVE 头", () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56,
      0x45,
    ]);

    expect(isWavHeader(bytes)).toBe(true);
  });

  it("拒绝不足 12 字节的输入", () => {
    expect(isWavHeader(new Uint8Array(0))).toBe(false);
    expect(isWavHeader(new Uint8Array(11))).toBe(false);
  });

  it("拒绝非 WAV 文件头", () => {
    expect(isWavHeader(new TextEncoder().encode("GIF89a......"))).toBe(
      false,
    );
  });

  it("RIFF 或 WAVE 任一不匹配都拒绝", () => {
    expect(isWavHeader(new TextEncoder().encode("RIFF....JUNK"))).toBe(false);
    expect(isWavHeader(new TextEncoder().encode("XXXX....WAVE"))).toBe(false);
  });
});

describe("downsample", () => {
  it("48kHz 一秒音频降为 16kHz", () => {
    const input = new Float32Array(48_000);
    const output = downsample(input, 48_000);

    expect(output.length).toBe(16_000);
  });

  it("低于 16kHz 时线性上采样，保持时长不变", () => {
    const input = new Float32Array([0.1, -0.2, 0.3]);
    const output = downsample(input, 8_000);

    // 8kHz 3 个样本 = 0.375ms，上采样到 16kHz 后应有 6 个样本
    expect(output.length).toBe(6);
    expect(output[0]).toBeCloseTo(0.1, 6);
    expect(output[2]).toBeCloseTo(-0.2, 6);
    expect(output[4]).toBeCloseTo(0.3, 6);
    expect(output[5]).toBeCloseTo(0.3, 6);
  });

  it("16kHz 输入原样复制", () => {
    const input = new Float32Array([0.1, -0.2, 0.3]);
    const output = downsample(input, 16_000);

    expect(output.length).toBe(3);
    expect(output[0]).toBeCloseTo(0.1, 6);
    expect(output[1]).toBeCloseTo(-0.2, 6);
    expect(output[2]).toBeCloseTo(0.3, 6);
    expect(output).not.toBe(input);
  });

  it("保留正弦波的正负峰值", () => {
    const input = new Float32Array(48_000);

    for (let index = 0; index < input.length; index += 1) {
      input[index] = Math.sin((2 * Math.PI * 440 * index) / 48_000);
    }

    const output = downsample(input, 48_000);

    expect(output.length).toBe(16_000);
    expect(Math.max(...output)).toBeGreaterThan(0.99);
    expect(Math.min(...output)).toBeLessThan(-0.99);
  });

  it("空音频返回空数组", () => {
    expect(downsample(new Float32Array(0), 48_000).length).toBe(0);
  });
});

describe("mergeChunks", () => {
  it("按顺序拼接多个分片", () => {
    const merged = mergeChunks([
      new Float32Array([1, 2]),
      new Float32Array([]),
      new Float32Array([3, 4, 5]),
    ]);

    expect(Array.from(merged)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("encodeWav16kMono", () => {
  it("生成合法的 16kHz 单声道 WAV 头", async () => {
    const blob = encodeWav16kMono(new Float32Array(16_000));
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    expect(blob.type).toBe("audio/wav");
    expect(readAscii(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(buffer.byteLength - 8);
    expect(readAscii(view, 8, 4)).toBe("WAVE");
    expect(readAscii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(ASR_SAMPLE_RATE);
    expect(view.getUint32(28, true)).toBe(32_000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(readAscii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(32_000);
    expect(buffer.byteLength).toBe(44 + 32_000);
  });

  it("超范围采样值被限制在 16 位区间", async () => {
    const buffer = await encodeWav16kMono(
      new Float32Array([2, -2, 0]),
    ).arrayBuffer();
    const view = new DataView(buffer);

    expect(view.getInt16(44, true)).toBe(32_767);
    expect(view.getInt16(46, true)).toBe(-32_768);
    expect(view.getInt16(48, true)).toBe(0);
  });
});
