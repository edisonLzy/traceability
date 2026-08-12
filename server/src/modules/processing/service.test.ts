import { describe, expect, it, vi } from "vitest";

import type { ProcessingRepository } from "./repository.js";
import { ProcessingService } from "./service.js";
import type { EventFields } from "./types.js";

describe("ProcessingService native crash grouping", () => {
  it("derives a useful native crash title and issue type without a JavaScript exception", async () => {
    let fields: EventFields | undefined;
    const repository = {
      processEventItem: vi.fn(async (_itemId, deriveFields) => {
        fields = deriveFields(
          {
            platform: "native",
            level: "fatal",
            tags: { "event.process": "browser", "exit.reason": "crashed" },
          },
          new Date("2026-08-11T00:00:00.000Z"),
        );
      }),
    } as unknown as ProcessingRepository;
    const service = new ProcessingService(repository);

    await service.processEventItem("item-1");

    expect(fields).toMatchObject({
      title: "NativeCrash: browser process crashed (crashed)",
      type: "native_crash",
      level: "fatal",
    });
  });
});
