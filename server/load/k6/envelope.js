import { check, sleep } from "k6";
import http from "k6/http";

const target = __ENV.TARGET_URL || "http://127.0.0.1:3000";
const accessToken = __ENV.ACCESS_TOKEN;
const rate = Number(__ENV.RATE || 50);
const duration = __ENV.DURATION || "15m";

export const options = {
  scenarios: {
    envelope_ingest: {
      executor: "constant-arrival-rate",
      rate,
      timeUnit: "1s",
      duration,
      preAllocatedVUs: Math.max(20, rate),
      maxVUs: Math.max(100, rate * 3),
    },
  },
  thresholds: {
    checks: ["rate>0.995"],
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<200"],
  },
};

export function setup() {
  if (!accessToken) throw new Error("ACCESS_TOKEN is required");
  const project = http.post(
    `${target}/api/trpc/projects.create`,
    JSON.stringify({
      slug: `k6-${Date.now()}`,
      name: "k6 load test",
      platform: "javascript",
    }),
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
    },
  );
  if (project.status !== 200) throw new Error(`could not create load project: ${project.body}`);
  return project.json().result.data;
}

export default function (project) {
  // Date keeps IDs unique when a VU is recycled; VU/iteration makes collisions
  // impossible for requests created inside the same millisecond in normal runs.
  const eventId = `${Date.now().toString(16)}${__VU.toString(16).padStart(4, "0")}${__ITER
    .toString(16)
    .padStart(12, "0")}`
    .padStart(32, "0")
    .slice(-32);
  const envelope = [
    JSON.stringify({ event_id: eventId, dsn: project.dsn }),
    JSON.stringify({ type: "event", content_type: "application/json" }),
    JSON.stringify({
      event_id: eventId,
      level: "error",
      timestamp: Date.now() / 1_000,
      exception: {
        values: [
          {
            type: "TypeError",
            value: `load test ${__VU}/${__ITER}`,
            stacktrace: { frames: [{ filename: "app.js", function: "render", in_app: true }] },
          },
        ],
      },
    }),
    "",
  ].join("\n");
  const response = http.post(
    `${target}/api/${project.project.sentryProjectId}/envelope/`,
    envelope,
    {
      headers: { "content-type": "application/x-sentry-envelope" },
    },
  );
  check(response, { "accepted after durable commit": (result) => result.status === 200 });
  sleep(0.001);
}
