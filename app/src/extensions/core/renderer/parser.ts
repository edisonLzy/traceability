export interface ParsedExtensionPart {
  kind: "text" | "block";
  text?: string;
  payload?: {
    type: string;
    props: unknown;
    raw: string;
  };
}

const EXTENSION_FENCE_PATTERN = /```(agent-block)\s*([\s\S]*?)```/g;

export function parseExtensionParts(content: string): ParsedExtensionPart[] {
  const parts: ParsedExtensionPart[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(EXTENSION_FENCE_PATTERN)) {
    const matchStart = match.index ?? 0;
    const fullMatch = match[0];
    const raw = (match[2] ?? "").trim();

    if (matchStart > lastIndex) {
      parts.push({ kind: "text", text: content.slice(lastIndex, matchStart) });
    }

    const parsedPart = parsePayload(raw);
    if (parsedPart) {
      parts.push(parsedPart);
    } else {
      parts.push({ kind: "text", text: fullMatch });
    }

    lastIndex = matchStart + fullMatch.length;
  }

  if (lastIndex < content.length) {
    parts.push({ kind: "text", text: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ kind: "text", text: content }];
}

function parsePayload(raw: string): ParsedExtensionPart | null {
  try {
    const parsed = JSON.parse(raw) as {
      type?: unknown;
      props?: unknown;
    };

    if (typeof parsed.type !== "string") {
      return null;
    }

    return {
      kind: "block",
      payload: {
        type: parsed.type,
        props: "props" in parsed ? parsed.props : {},
        raw,
      },
    };
  } catch {
    return null;
  }
}
