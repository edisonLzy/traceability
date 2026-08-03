import { init, metrics, startSpan } from "@traceability/monitor/electron-renderer";
init({});

document.querySelector("#trace-metrics")?.addEventListener("click", () => {
  startSpan(
    {
      name: "electron-demo.telemetry",
      op: "ui.action",
      forceTransaction: true,
      attributes: { "demo.process": "renderer" },
    },
    () => {
      metrics.count("electron.demo.click", 1, { attributes: { process: "renderer" } });
      metrics.gauge("electron.demo.pending", 0, { attributes: { process: "renderer" } });
      metrics.distribution("electron.demo.duration", 12, {
        unit: "millisecond",
        attributes: { process: "renderer" },
      });
    },
  );
});
