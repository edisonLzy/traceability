import { describe, expect, it } from "vitest";

import { parseAndScrubEvent } from "../scrubber.js";

describe("parseAndScrubEvent", () => {
  it("filters sensitive fields and recognizable values before persistence", () => {
    const event = parseAndScrubEvent(
      Buffer.from(
        JSON.stringify({
          user: { email: "person@example.test" },
          request: { headers: { authorization: "Bearer super-secret" } },
          extra: { token: "secret", text: "JWT eyJabc123456.abcdef123456.signature123456" },
        }),
      ),
    );

    expect(event).toMatchObject({
      user: { email: "[Filtered Email]" },
      request: { headers: { authorization: "[Filtered]" } },
      extra: { token: "[Filtered]", text: "JWT [Filtered JWT]" },
    });
  });
});
