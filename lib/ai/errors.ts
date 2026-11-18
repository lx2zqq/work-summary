export type AiErrorKind = "config" | "request" | "output" | "timeout";

export class AiError extends Error {
  constructor(
    message: string,
    public readonly kind: AiErrorKind = "request",
  ) {
    super(message);
    this.name = "AiError";
  }
}
