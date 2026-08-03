import { init, startResourceMonitor } from "@traceability/monitor/electron-main";

init({
  dsn: process.env.TRACEABILITY_DEMO_DSN ?? "https://dummy@localhost/1",
  tracesSampleRate: 1,
});
startResourceMonitor();
