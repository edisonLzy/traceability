import { describe, expect, it, vi } from "vitest";

import type { TraceRepository } from "../repository.js";
import { TraceService } from "../service.js";

const projectId = "00000000-0000-4000-8000-000000000001";
const traceId = "a".repeat(32);

function span(input: {
  id: string;
  spanId: string;
  parentSpanId: string | null;
  start: number;
  name: string;
  isSegment?: boolean;
}) {
  const startTimestamp = new Date(input.start);
  return {
    id: input.id,
    projectId,
    ingestItemId: "00000000-0000-4000-8000-000000000002",
    traceId,
    spanId: input.spanId,
    parentSpanId: input.parentSpanId,
    name: input.name,
    op: null,
    status: "ok",
    isSegment: input.isSegment ?? false,
    startTimestamp,
    endTimestamp: new Date(input.start + 1),
    durationMs: 1,
    release: "test@1",
    environment: "test",
    attributes: {},
    measurements: null,
    createdAt: startTimestamp,
  };
}

describe("TraceService", () => {
  it("builds multiple roots, nested children, orphan markers, and cycle markers", async () => {
    const repository = {
      get: vi.fn().mockResolvedValue({
        spans: [
          span({ id: "1", spanId: "root", parentSpanId: null, start: 300, name: "root" }),
          span({ id: "2", spanId: "child", parentSpanId: "root", start: 400, name: "child" }),
          span({
            id: "3",
            spanId: "orphan",
            parentSpanId: "missing",
            start: 100,
            name: "orphan",
          }),
          span({ id: "4", spanId: "second-root", parentSpanId: null, start: 200, name: "second" }),
          span({
            id: "5",
            spanId: "cycle-a",
            parentSpanId: "cycle-b",
            start: 500,
            name: "cycle-a",
          }),
          span({
            id: "6",
            spanId: "cycle-b",
            parentSpanId: "cycle-a",
            start: 600,
            name: "cycle-b",
          }),
        ],
        linkedEvents: [{ id: "event-1" }],
        metricCount: 7,
      }),
    } as unknown as TraceRepository;
    const service = new TraceService(repository);

    const result = await service.get(projectId, traceId);

    expect(result.roots.map((root) => root.name)).toEqual([
      "orphan",
      "second",
      "root",
      "cycle-a",
      "cycle-b",
    ]);
    expect(result.roots[0]).toMatchObject({ orphaned: true, parentSpanId: "missing" });
    expect(result.roots[2]).toMatchObject({ orphaned: false, children: [{ name: "child" }] });
    expect(result.roots[3]).toMatchObject({ orphaned: true, parentSpanId: "cycle-b" });
    expect(result.roots[4]).toMatchObject({ orphaned: true, parentSpanId: "cycle-a" });
    expect(result.linkedEvents).toHaveLength(1);
    expect(result.metricCount).toBe(7);
  });

  it("passes filters, paginates, and decodes a trace cursor", async () => {
    const rows = [
      span({ id: "1", spanId: "root-1", parentSpanId: null, start: 300, name: "one" }),
      span({ id: "2", spanId: "root-2", parentSpanId: null, start: 200, name: "two" }),
    ];
    const repository = {
      list: vi.fn().mockResolvedValue(rows),
      get: vi.fn(),
    } as unknown as TraceRepository;
    const service = new TraceService(repository);
    const from = new Date(100);
    const to = new Date(500);

    const first = await service.list({
      projectId,
      from,
      to,
      name: "root",
      op: "http.server",
      status: "ok",
      environment: "test",
      release: "test@1",
      limit: 1,
    });
    expect(first.data).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        from,
        to,
        name: "root",
        op: "http.server",
        status: "ok",
        environment: "test",
        release: "test@1",
        limit: 1,
        cursor: undefined,
      }),
    );

    await service.list({ projectId, from, to, cursor: first.nextCursor!, limit: 1 });
    expect(repository.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: { startTimestamp: rows[0]?.startTimestamp, id: rows[0]?.id },
      }),
    );
  });

  it("rejects invalid ranges and cursors", async () => {
    const repository = { list: vi.fn(), get: vi.fn() } as unknown as TraceRepository;
    const service = new TraceService(repository);

    await expect(
      service.list({
        projectId,
        from: new Date(0),
        to: new Date(31 * 24 * 60 * 60 * 1_000),
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      service.list({ projectId, cursor: "not-base64", limit: 10 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
