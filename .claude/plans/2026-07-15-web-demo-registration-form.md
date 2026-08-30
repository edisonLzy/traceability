# web-demo 注册表单实现计划

## 目标

在 `examples/web-demo` 新增一个**纯前端**用户注册表单（不接入 Traceability SDK），覆盖核心字段，并尽量多考虑校验 case 与边界情况。保持 vanilla Vite + TS 风格，不引入框架/CSS 框架。

## 字段（核心）

1. 用户名 `username`
2. 邮箱 `email`
3. 密码 `password`（含显示/隐藏、强度条、字符计数）
4. 确认密码 `confirmPassword`
5. 同意条款 `agreeTerms`（必选 checkbox）
6. 订阅通讯 `subscribe`（可选 checkbox）

## 校验规则与 case（逐字段）

### 用户名

- 必填，先 trim
- 长度 3–20
- 正则 `^[A-Za-z][A-Za-z0-9_]+$`（字母开头，仅字母/数字/下划线）
- case：空、纯空格、过短(1–2)、超长(>20)、数字开头、下划线开头、含空格、含 emoji/中文、含特殊符号(`@`/`-`)、边界值 3 与 20 合法

### 邮箱

- 必填，trim 后小写化
- 格式 `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`，TLD ≥2 字母
- 屏蔽一次性邮箱域名（mailinator/tempmail/10minutemail/guerrillamail/yopmail，大小写不敏感）
- case：空、缺 `@`、双 `@`、缺域名、缺点(TLD)、TLD 单字符、含空格、大写归一化、本地点/`+`别名、一次性域名

### 密码

- 必填，长度 8–64
- 复杂度：大写 + 小写 + 数字 + 特殊符号各 ≥1，无空白
- 强度条：weak/fair/good/strong（输入时实时）
- case：空、过短、无大写、无小写、无数字、无特殊、含空格、超长、强密码

### 确认密码

- 必填，必须与密码完全一致
- 密码改动后若已填确认则重新校验
- case：空、不一致、一致后改密码

### 同意条款

- 必须勾选才能提交
- case：未勾选提交（报错并聚焦）

### 订阅通讯

- 可选，无校验

## 表单级行为 / case

- 校验时机：失焦校验单字段；提交时全量校验；首次报错后该字段输入即重校验
- 密码强度条与确认匹配：输入时实时
- trim/归一化后再校验（邮箱小写、用户名去首尾空格）
- 双击防重：提交期间禁用按钮 + loading 文案
- 模拟提交：mock 异步（`setTimeout`），含 loading/成功/失败态；附「模拟服务端错误」checkbox 演示失败路径
- 成功态：展示成功卡片（用户名/邮箱，HTML 转义防 XSS），「再注册一个」重置回表单
- XSS case：用户名含 `<script>` 时成功页正确转义，不执行
- 字符计数：username/password 显示 `x/上限`
- 可访问性：`<label>`、`aria-invalid`、`aria-describedby` 指向错误、提交报错时聚焦首个出错字段
- 键盘：Enter 提交、Tab 顺序合理
- 响应式：窄屏可正常使用

## 文件结构

- `examples/web-demo/src/validation.ts`（新增）— 纯校验函数：`validateUsername/Email/Password/ConfirmPassword`、`passwordStrength`、`FieldError` 类型；无 DOM 依赖
- `examples/web-demo/src/register.ts`（新增）— DOM 绑定：状态、校验触发、提交流、显示/隐藏密码、强度条、成功/失败 UI、XSS 转义
- `examples/web-demo/src/styles.css`（新增）— 表单样式（在 `main.ts` 中 `import "./styles.css"`，Vite 原生支持）
- `examples/web-demo/src/validation.test.ts`（新增）— vitest 用例，编码上述各 case（纯函数，便于枚举边界）
- `examples/web-demo/index.html`（改）— 新增 `<section id="register">` 表单结构（语义化、可访问）
- `examples/web-demo/src/main.ts`（改）— `import "./register"` 挂载；保留原有 SDK 演示按钮
- `examples/web-demo/package.json`（改）— 加 `"test": "vitest run"` 与 `vitest: "catalog:"` devDep（与 server/core 一致）

## 不做

- 不接入 Traceability SDK（按用户选择「纯表单，不联动」）
- 不引入 React/Tailwind 等框架（保持 vanilla）
- 不动 server / app / 其他 packages

## 验证

- `pnpm --filter @traceability/example-web-demo dev` → http://localhost:5174 手测各 case
- `pnpm --filter @traceability/example-web-demo test` → 校验函数用例全绿
- `pnpm --filter @traceability/example-web-demo build` → 构建通过
