import { describe, expect, it, vi } from "vitest";

import type { MetricsRepository } from "../repository.js";
import { MetricsService } from "../service.js";

const projectId = "00000000-0000-4000-8000-000000000001";
const baseRange = { from: new Date(0), to: new Date(200_000) };

const summary = {
  sum: 10,
  count: 2,
  min: 1,
  max: 9,
  avg: 5,
  latest: 9,
  p50: 5,
  p95: 8.6,
  p99: 8.96,
};

const points = [
  {
    bucket: new Date(0),
    sum: 10,
    count: 2,
    min: 1,
    max: 9,
    avg: 5,
    latest: 9,
    p50: 5,
    p95: 8.6,
    p99: 8.96,
  },
];

describe("MetricsService", () => {
  it("paginates the metric catalog and encodes a cursor", async () => {
    const repository = {
      catalog: vi.fn().mockResolvedValue([
        { name: "a.metric", type: "counter", unit: null, sampleCount: 2, lastSeen: new Date(1) },
        {
          name: "b.metric",
          type: "gauge",
          unit: "millisecond",
          sampleCount: 1,
          lastSeen: new Date(2),
        },
      ]),
    } as unknown as MetricsRepository;
    const service = new MetricsService(repository);

    const result = await service.catalog({ projectId, limit: 1 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.name).toBe("a.metric");
    expect(result.nextCursor).toBeTruthy();
    expect(repository.catalog).toHaveBeenCalledWith(
      expect.objectContaining({ projectId, limit: 1, cursor: undefined }),
    );
  });

  it("returns type-specific counter, gauge, and distribution aggregates", async () => {
    const repository = {
      series: vi.fn().mockResolvedValue({ points, summary }),
    } as unknown as MetricsRepository;
    const service = new MetricsService(repository);

    const counter = await service.series({
      projectId,
      name: "counter",
      type: "counter",
      unit: null,
      ...baseRange,
      resolution: "1m",
      attributes: { state: "ok" },
    });
    expect(counter).toEqual({
      type: "counter",
      unit: null,
      points: [{ bucket: new Date(0), sum: 10 }],
      summary: { sum: 10 },
    });

    const gauge = await service.series({
      projectId,
      name: "gauge",
      type: "gauge",
      unit: "millisecond",
      ...baseRange,
      resolution: "5m",
      traceId: "a".repeat(32),
      spanId: "b".repeat(16),
      attributes: { state: "ok" },
    });
    expect(gauge).toEqual({
      type: "gauge",
      unit: "millisecond",
      points: [{ bucket: new Date(0), latest: 9, min: 1, max: 9, avg: 5 }],
      summary: { latest: 9, min: 1, max: 9, avg: 5 },
    });

    const distribution = await service.series({
      projectId,
      name: "distribution",
      type: "distribution",
      unit: "millisecond",
      ...baseRange,
      resolution: "1h",
      attributes: {},
    });
    expect(distribution).toEqual({
      type: "distribution",
      unit: "millisecond",
      points: [
        {
          bucket: new Date(0),
          count: 2,
          sum: 10,
          min: 1,
          max: 9,
          avg: 5,
          p50: 5,
          p95: 8.6,
          p99: 8.96,
        },
      ],
      summary: { count: 2, sum: 10, min: 1, max: 9, avg: 5, p50: 5, p95: 8.6, p99: 8.96 },
    });
    expect(repository.series).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "a".repeat(32),
        spanId: "b".repeat(16),
        attributes: { state: "ok" },
      }),
    );
  });

  it("rejects invalid ranges and cursors", async () => {
    const repository = { catalog: vi.fn(), series: vi.fn() } as unknown as MetricsRepository;
    const service = new MetricsService(repository);

    await expect(
      service.catalog({
        projectId,
        from: new Date(0),
        to: new Date(31 * 24 * 60 * 60 * 1_000),
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      service.catalog({ projectId, cursor: "not-base64", limit: 10 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("groups by an attribute and returns type-specific columns", async () => {
    const rows = [
      {
        value: "/a",
        count: 3,
        sum: 30,
        min: 1,
        max: 9,
        avg: 5,
        latest: 9,
        p50: 5,
        p95: 8.6,
        p99: 8.96,
      },
      {
        value: "/b",
        count: 1,
        sum: 10,
        min: 1,
        max: 9,
        avg: 5,
        latest: 9,
        p50: 5,
        p95: 8.6,
        p99: 8.96,
      },
    ];
    const repository = { groups: vi.fn().mockResolvedValue(rows) } as unknown as MetricsRepository;
    const service = new MetricsService(repository);

    const result = await service.groups({
      projectId,
      name: "latency",
      type: "distribution",
      unit: "millisecond",
      ...baseRange,
      groupBy: "path",
      orderBy: "p95",
      orderDesc: true,
      limit: 10,
      attributes: {},
    });

    expect(result).toEqual({
      type: "distribution",
      unit: "millisecond",
      groupBy: "path",
      groups: [
        {
          value: "/a",
          count: 3,
          sum: 30,
          min: 1,
          max: 9,
          avg: 5,
          p50: 5,
          p95: 8.6,
          p99: 8.96,
        },
        {
          value: "/b",
          count: 1,
          sum: 10,
          min: 1,
          max: 9,
          avg: 5,
          p50: 5,
          p95: 8.6,
          p99: 8.96,
        },
      ],
    });
    expect(repository.groups).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        groupBy: "path",
        orderBy: "p95",
        orderDesc: true,
        limit: 10,
      }),
    );
  });

  it("groups slices columns per metric type (counter)", async () => {
    const repository = {
      groups: vi.fn().mockResolvedValue([
        {
          value: "/x",
          count: 2,
          sum: 7,
          latest: 7,
          min: 1,
          max: 6,
          avg: 3.5,
          p50: 3.5,
          p95: 6.9,
          p99: 6.99,
        },
      ]),
    } as unknown as MetricsRepository;
    const service = new MetricsService(repository);

    const result = await service.groups({
      projectId,
      name: "calls",
      type: "counter",
      unit: null,
      ...baseRange,
      groupBy: "path",
      attributes: {},
    });

    expect(result).toEqual({
      type: "counter",
      unit: null,
      groupBy: "path",
      groups: [{ value: "/x", count: 2, sum: 7 }],
    });
    expect(repository.groups).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: "count", orderDesc: true, limit: 50 }),
    );
  });
});
