// 浏览器录音得到的是 Float32 PCM，这里统一转成 16kHz 单声道 16-bit WAV。
// 纯函数实现，方便单测；不依赖 DOM API。

export const ASR_SAMPLE_RATE = 16_000;

/** WAV 头的前 12 字节：RIFF + 4 字节长度 + WAVE */
const WAV_MAGIC_BYTES = 12;

/** 校验文件头魔数，防止把非 WAV 文件当作录音上传 */
export function isWavHeader(bytes: Uint8Array): boolean {
  if (bytes.length < WAV_MAGIC_BYTES) return false;

  return (
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x41 && // A
    bytes[10] === 0x56 && // V
    bytes[11] === 0x45 // E
  );
}

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

/**
 * 把任意采样率的 PCM 线性重采样到 16kHz。
 * 输入低于 16kHz 时上采样，避免直接按 16kHz 编码导致音频加速变调；
 * 输入高于 16kHz 时降采样。
 */
export function downsample(
  samples: Float32Array,
  inputSampleRate: number,
): Float32Array {
  if (inputSampleRate <= 0 || samples.length === 0) {
    return new Float32Array(0);
  }

  if (inputSampleRate === ASR_SAMPLE_RATE) {
    return samples.slice();
  }

  const ratio = inputSampleRate / ASR_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(outputLength);

  // 线性插值，短录音足够用，避免引入额外依赖
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const left = Math.min(Math.floor(position), samples.length - 1);
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
