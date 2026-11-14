// 浏览器录音得到的是 Float32 PCM，这里统一转成 16kHz 单声道 16-bit WAV。
// 纯函数实现，方便单测；不依赖 DOM API。

export const ASR_SAMPLE_RATE = 16_000;

const WAV_HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

export function mergeChunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

export function downsample(
  samples: Float32Array,
  inputSampleRate: number,
): Float32Array {
  if (inputSampleRate <= 0 || samples.length === 0) {
    return new Float32Array(0);
  }

  if (inputSampleRate <= ASR_SAMPLE_RATE) {
    return samples.slice();
  }

  const ratio = inputSampleRate / ASR_SAMPLE_RATE;
  const outputLength = Math.floor(samples.length / ratio);
  const output = new Float32Array(outputLength);

  // 线性插值降采样，短录音足够用，避免引入额外依赖
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;

    output[index] =
      samples[left] * (1 - weight) + samples[right] * weight;
  }

  return output;
}

export function encodeWav16kMono(samples: Float32Array): Blob {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk 大小
  view.setUint16(20, 1, true); // PCM 编码
  view.setUint16(22, 1, true); // 单声道
  view.setUint32(24, ASR_SAMPLE_RATE, true);
  view.setUint32(
    28,
    ASR_SAMPLE_RATE * BYTES_PER_SAMPLE,
    true,
  ); // 每秒字节数
  view.setUint16(32, BYTES_PER_SAMPLE, true); // 块对齐
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = WAV_HEADER_BYTES;

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    // 负数按 0x8000 缩放，正数按 0x7fff 缩放，避免正数削波
    const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

    view.setInt16(offset, value, true);
    offset += BYTES_PER_SAMPLE;
  }

  return new Blob([buffer], { type: "audio/wav" });
}
