export type SSEEvent = {
  event: string;
  data: unknown;
};

/** 服务端把事件编码成 SSE 文本 */
export function encodeSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseEvent(raw: string): SSEEvent | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;

  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

/**
 * 前端按 chunk 喂数据，返回已经完整的 SSE 事件。
 * 事件可能跨 chunk，所以内部要保留缓冲区。
 */
export class SSEDecoder {
  private buffer = "";

  push(chunk: string): SSEEvent[] {
    this.buffer += chunk;

    const events: SSEEvent[] = [];
    let index = this.buffer.search(/\r?\n\r?\n/);

    while (index >= 0) {
      const raw = this.buffer.slice(0, index);
      const separator = this.buffer.match(/\r?\n\r?\n/)?.[0] ?? "\n\n";
      this.buffer = this.buffer.slice(index + separator.length);

      const parsed = parseEvent(raw);
      if (parsed) events.push(parsed);

      index = this.buffer.search(/\r?\n\r?\n/);
    }

    return events;
  }
}
