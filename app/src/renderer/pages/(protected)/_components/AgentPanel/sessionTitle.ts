/** Matches divisor's deterministic title behaviour without calling a second model. */
export function createSessionTitleFromPrompt(prompt: string): string {
  return prompt.replaceAll(/\s+/g, " ").trim().slice(0, 80);
}

export function shouldAutoRenameSession(name: string | undefined): boolean {
  return !name || name.trim() === "" || name.trim().toLowerCase() === "new conversation";
}
