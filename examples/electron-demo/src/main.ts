import { init, startResourceMonitor } from "@traceability/monitor/electron-main";

init({ dsn: "https://dummy@localhost/1" });
startResourceMonitor();
