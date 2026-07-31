import { throwProductionSourcemapError } from "./previewFailure";
import { setupRegisterForm } from "./register";
import { initTraceability } from "./traceability";

import "./styles.css";

// Initialize Traceability monitoring
initTraceability();

// 用户注册表单（纯前端校验演示）
setupRegisterForm();

// Wire the "throw production source-map error" button, if the page includes it.
// The button lives in index.html; clicking it invokes a real Error whose stack
// crosses previewFailure.ts and gets symbolicated after the map is uploaded.
document.getElementById("btn-throw-sourcemap-error")?.addEventListener("click", () => {
  throwProductionSourcemapError();
});
