export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

export class NonInteractiveAuthError extends Error {
  readonly code = "NON_INTERACTIVE_AUTH" as const;

  constructor(message: string) {
    super(message);
    this.name = "NonInteractiveAuthError";
  }
}
