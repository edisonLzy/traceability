import { afterEach, describe, expect, it } from "vitest";

import { NonInteractiveAuthError, isInteractive } from "./config-interactive.js";

const originalStdinTTY = process.stdin.isTTY;
const originalStderrTTY = process.stderr.isTTY;

afterEach(() => {
  Object.defineProperty(process.stdin, "isTTY", { value: originalStdinTTY, configurable: true });
  Object.defineProperty(process.stderr, "isTTY", { value: originalStderrTTY, configurable: true });
});

describe("isInteractive", () => {
  it("returns true when both stdin and stderr are TTY", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    expect(isInteractive()).toBe(true);
  });

  it("returns false when stdin is not a TTY", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    expect(isInteractive()).toBe(false);
  });

  it("returns false when stderr is not a TTY", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    expect(isInteractive()).toBe(false);
  });
});

describe("NonInteractiveAuthError", () => {
  it("carries a stable code", () => {
    const err = new NonInteractiveAuthError("no tty");
    expect(err.code).toBe("NON_INTERACTIVE_AUTH");
    expect(err.message).toBe("no tty");
    expect(err).toBeInstanceOf(Error);
  });
});
