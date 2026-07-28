export interface ParsedEnvelope {
  header: Record<string, unknown>;
  items: ParsedEnvelopeItem[];
}

export interface ParsedEnvelopeItem {
  sequence: number;
  type: string;
  header: Record<string, unknown>;
  payload: Buffer;
}

export class EnvelopeParseError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EnvelopeParseError";
  }
}

export function parseEnvelope(
  body: Buffer,
  options: { maxItems: number; maxItemBytes: number },
): ParsedEnvelope {
  if (body.length === 0) throw new EnvelopeParseError("empty envelope");

  let cursor = 0;
  const envelopeHeader = readJsonLine(body, cursor);
  cursor = envelopeHeader.next;
  const header = asObject(envelopeHeader.value, "invalid envelope header");
  const items: ParsedEnvelopeItem[] = [];

  while (cursor < body.length) {
    if (body[cursor] === 0x0a) {
      cursor += 1;
      continue;
    }
    if (items.length >= options.maxItems) throw new EnvelopeParseError("too many envelope items");

    const itemHeader = readJsonLine(body, cursor);
    cursor = itemHeader.next;
    const item = asObject(itemHeader.value, "invalid item header");
    const type = item.type;
    if (typeof type !== "string" || type.length === 0) {
      throw new EnvelopeParseError("item header is missing type");
    }

    let payload: Buffer;
    const length = item.length;
    if (length !== undefined) {
      if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) {
        throw new EnvelopeParseError("item header has invalid length");
      }
      if (length > options.maxItemBytes) throw new EnvelopeParseError("item exceeds maximum size");
      if (cursor + length > body.length) throw new EnvelopeParseError("item payload is truncated");

      payload = body.subarray(cursor, cursor + length);
      cursor += length;
      if (body[cursor] === 0x0a) cursor += 1;
    } else {
      const newline = body.indexOf(0x0a, cursor);
      const end = newline === -1 ? body.length : newline;
      if (end - cursor > options.maxItemBytes)
        throw new EnvelopeParseError("item exceeds maximum size");

      payload = body.subarray(cursor, end);
      cursor = newline === -1 ? body.length : newline + 1;
    }

    items.push({ sequence: items.length, type, header: item, payload });
  }

  return { header, items };
}

function readJsonLine(body: Buffer, cursor: number): { value: unknown; next: number } {
  const newline = body.indexOf(0x0a, cursor);
  const end = newline === -1 ? body.length : newline;
  if (end === cursor) throw new EnvelopeParseError("expected JSON header");

  try {
    return {
      value: JSON.parse(body.subarray(cursor, end).toString("utf8")),
      next: newline === -1 ? body.length : newline + 1,
    };
  } catch {
    throw new EnvelopeParseError("invalid JSON header");
  }
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EnvelopeParseError(message);
  }
  return value as Record<string, unknown>;
}
