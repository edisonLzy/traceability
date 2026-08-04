import { init, startResourceMonitor } from "@tracerability/monitor/electron-main";

init({
  dsn: process.env.TRACEABILITY_DEMO_DSN ?? "https://dummy@localhost/1",
  tracesSampleRate: 1,
});
startResourceMonitor();
