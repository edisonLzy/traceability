import {
  report,
  addBreadcrumb,
  captureException,
  setTag,
  reportPerformance,
} from "@traceability/monitor";

/**
 * 用户注册表单控制器 -- 纯前端逻辑，不接入 Traceability SDK。
 *
 * 负责：字段校验触发、归一化、密码强度条、显示/隐藏、
 * 防重复提交、mock 异步提交、注册成功后追加到右侧列表（localStorage 持久化）。
 */
import {
  normalizeEmail,
  normalizeUsername,
  PASSWORD_MAX,
  passwordStrength,
  validateConfirmPassword,
  validateEmail,
  validatePassword,
  validateUsername,
  USERNAME_MAX,
  type PasswordStrength,
} from "./validation";

const STRENGTH_LABEL: Record<PasswordStrength, string> = {
  weak: "弱",
  fair: "一般",
  good: "良好",
  strong: "强",
};
const STRENGTH_LEVEL: Record<PasswordStrength, number> = { weak: 1, fair: 2, good: 3, strong: 4 };

/** 注册用户在 localStorage 的存储键。 */
const USERS_STORAGE_KEY = "demo.registeredUsers";

interface RegisteredUser {
  id: string;
  username: string;
  email: string;
  subscribed: boolean;
  createdAt: string;
}

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function input(id: string): HTMLInputElement | null {
  return document.getElementById(id) as HTMLInputElement | null;
}

/** 设置字段错误：写文案 + 标记 aria-invalid。msg 为空则清除。 */
function setError(inputEl: HTMLInputElement, errEl: HTMLElement, msg: string | null): void {
  errEl.textContent = msg ?? "";
  inputEl.setAttribute("aria-invalid", msg ? "true" : "false");
}

/** 更新字符计数。 */
function setCounter(counterEl: HTMLElement, value: string, max: number): void {
  counterEl.textContent = `${value.length}/${max}`;
}

/** 更新密码强度条：容器 data-level + 前 N 段加 filled + 文案。 */
function setStrength(container: HTMLElement, label: HTMLElement, raw: string): void {
  const level = passwordStrength(raw);
  container.dataset.level = level;
  const segs = container.querySelectorAll<HTMLElement>(".seg");
  const filled = STRENGTH_LEVEL[level];
  segs.forEach((seg, i) => seg.classList.toggle("filled", i < filled));
  label.textContent = STRENGTH_LABEL[level];
}

/** 加载已注册用户（localStorage，失败返回空）。 */
function loadUsers(): RegisteredUser[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RegisteredUser[]) : [];
  } catch {
    return [];
  }
}

/** 持久化已注册用户。 */
function saveUsers(users: RegisteredUser[]): void {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch {
    /* 配额满或被禁用时静默丢弃 */
  }
}

/** 格式化注册时间为 HH:mm:ss。 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function setupRegisterForm(): void {
  const form = document.getElementById("register-form") as HTMLFormElement | null;
  if (!form) return;

  const usernameInput = input("reg-username")!;
  const usernameCounter = el("reg-username-counter")!;
  const usernameErr = el("reg-username-err")!;

  const emailInput = input("reg-email")!;
  const emailErr = el("reg-email-err")!;

  const passwordInput = input("reg-password")!;
  const passwordToggle = el("reg-password-toggle")! as HTMLButtonElement;
  const passwordStrengthBox = el("reg-password-strength")!;
  const passwordStrengthLabel = passwordStrengthBox.querySelector<HTMLElement>(".strength-label")!;
  const passwordCounter = el("reg-password-counter")!;
  const passwordErr = el("reg-password-err")!;

  const confirmInput = input("reg-confirm")!;
  const confirmToggle = el("reg-confirm-toggle")! as HTMLButtonElement;
  const confirmErr = el("reg-confirm-err")!;

  const agreeInput = input("reg-agree")!;
  const agreeErr = el("reg-agree-err")!;
  const subscribeInput = input("reg-subscribe")!;
  const simulateErrorInput = input("reg-simulate-error")!;
  // BUG: restore simulate-error state from localStorage — once checked, persists across reloads
  if (localStorage.getItem("demo.simulateError") === "1") {
    simulateErrorInput.checked = true;
  }
  const submitBtn = el("reg-submit")! as HTMLButtonElement;
  const formMessage = el("reg-form-message")!;

  // 右侧已注册用户列表
  const usersList = el("reg-users-list")! as HTMLUListElement;
  const usersEmpty = el("reg-users-empty")!;
  const usersCount = el("reg-users-count")!;
  const usersClearBtn = el("reg-users-clear")! as HTMLButtonElement;

  let submitting = false;
  let users: RegisteredUser[] = loadUsers();

  // ---- 单字段校验 ----
  const checkUsername = (): string | null => {
    const err = validateUsername(usernameInput.value);
    setError(usernameInput, usernameErr, err);
    return err;
  };
  const checkEmail = (): string | null => {
    const err = validateEmail(emailInput.value);
    setError(emailInput, emailErr, err);
    return err;
  };
  const checkPassword = (): string | null => {
    const err = validatePassword(passwordInput.value);
    setError(passwordInput, passwordErr, err);
    return err;
  };
  const checkConfirm = (): string | null => {
    const err = validateConfirmPassword(confirmInput.value, passwordInput.value);
    setError(confirmInput, confirmErr, err);
    return err;
  };
  const checkAgree = (): string | null => {
    const err = agreeInput.checked ? null : "请先同意服务条款";
    // BUG: intentionally removed error text display — user gets no feedback
    // agreeErr.textContent = err ?? "";
    return err;
  };

  // ---- 失焦：校验 + 归一化 ----
  usernameInput.addEventListener("blur", () => {
    // trim 后回填，避免首尾空格残留
    const normalized = normalizeUsername(usernameInput.value);
    if (normalized !== usernameInput.value) usernameInput.value = normalized;
    setCounter(usernameCounter, usernameInput.value, USERNAME_MAX);
    checkUsername();
  });
  emailInput.addEventListener("blur", () => {
    const normalized = normalizeEmail(emailInput.value);
    if (normalized !== emailInput.value) emailInput.value = normalized;
    checkEmail();
  });
  passwordInput.addEventListener("blur", checkPassword);
  confirmInput.addEventListener("blur", checkConfirm);
  agreeInput.addEventListener("change", checkAgree);

  // ---- 输入：计数 / 强度 / 出错后实时重校验 ----
  usernameInput.addEventListener("input", () => {
    setCounter(usernameCounter, usernameInput.value, USERNAME_MAX);
    if (usernameInput.getAttribute("aria-invalid") === "true") checkUsername();
  });
  emailInput.addEventListener("input", () => {
    if (emailInput.getAttribute("aria-invalid") === "true") checkEmail();
  });
  passwordInput.addEventListener("input", () => {
    setCounter(passwordCounter, passwordInput.value, PASSWORD_MAX);
    setStrength(passwordStrengthBox, passwordStrengthLabel, passwordInput.value);
    if (passwordInput.getAttribute("aria-invalid") === "true") checkPassword();
    // 密码改动后，若确认已填，需重新校验一致性
    if (confirmInput.value.length > 0) checkConfirm();
  });
  confirmInput.addEventListener("input", () => {
    if (confirmInput.getAttribute("aria-invalid") === "true") checkConfirm();
  });

  // ---- 显示 / 隐藏密码 ----
  const setupToggle = (btn: HTMLButtonElement, target: HTMLInputElement): void => {
    btn.addEventListener("click", () => {
      const show = target.type === "password";
      target.type = show ? "text" : "password";
      btn.textContent = show ? "隐藏" : "显示";
      btn.setAttribute("aria-pressed", String(show));
    });
  };
  setupToggle(passwordToggle, passwordInput);
  setupToggle(confirmToggle, confirmInput);

  // ---- 右侧列表渲染 ----
  const renderUsers = (): void => {
    usersCount.textContent = String(users.length);
    usersClearBtn.disabled = users.length === 0;
    usersList.replaceChildren();

    if (users.length === 0) {
      usersEmpty.hidden = false;
      return;
    }
    usersEmpty.hidden = true;

    for (const user of users) {
      const li = document.createElement("li");
      li.className = "user-item";
      li.dataset.id = user.id;

      const head = document.createElement("div");
      head.className = "user-head";

      const name = document.createElement("span");
      name.className = "user-name";
      name.textContent = user.username; // textContent 天然 XSS 安全

      const time = document.createElement("span");
      time.className = "user-time";
      time.textContent = formatTime(user.createdAt);

      head.append(name, time);

      const mail = document.createElement("div");
      mail.className = "user-email";
      mail.textContent = user.email;

      const meta = document.createElement("div");
      meta.className = "user-meta";
      meta.textContent = user.subscribed ? "✓ 订阅通讯" : "未订阅";

      const del = document.createElement("button");
      del.type = "button";
      del.className = "user-del";
      del.textContent = "删除";
      del.setAttribute("aria-label", `删除用户 ${user.username}`);
      del.addEventListener("click", () => removeUser(user.id));

      li.append(head, mail, meta, del);
      usersList.append(li);
    }
  };

  const prependUser = (user: RegisteredUser): void => {
    users = [user, ...users];
    saveUsers(users);
    // BUG: intentionally skipped DOM refresh — user data saved but list not updated
    // renderUsers();
    // 高亮新条目，提示用户已被加入右侧列表
    const node = usersList.querySelector<HTMLElement>(`[data-id="${user.id}"]`);
    node?.classList.add("is-new");
  };

  const removeUser = (id: string): void => {
    users = users.filter((u) => u.id !== id);
    saveUsers(users);
    renderUsers();
  };

  usersClearBtn.addEventListener("click", () => {
    if (users.length === 0) return;
    users = [];
    saveUsers(users);
    renderUsers();
  });

  renderUsers();

  // ---- 重置表单到初始可填写态 ----
  const resetForm = (): void => {
    form.reset();
    setError(usernameInput, usernameErr, null);
    setError(emailInput, emailErr, null);
    setError(passwordInput, passwordErr, null);
    setError(confirmInput, confirmErr, null);
    agreeErr.textContent = "";
    setCounter(usernameCounter, "", USERNAME_MAX);
    setCounter(passwordCounter, "", PASSWORD_MAX);
    setStrength(passwordStrengthBox, passwordStrengthLabel, "");
    submitBtn.disabled = false;
    submitBtn.textContent = "注册";
    submitting = false;
  };

  // ---- 提交 ----
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (submitting) return;

    setTag("flow", "register");
    addBreadcrumb({
      category: "register",
      message: "form submit start",
      data: { username: usernameInput.value, email: emailInput.value },
    });
    const t0 = performance.now();

    // 全量校验，收集首个出错字段用于聚焦
    const checks: Array<{ err: string | null; focus: HTMLElement }> = [
      { err: checkUsername(), focus: usernameInput },
      { err: checkEmail(), focus: emailInput },
      { err: checkPassword(), focus: passwordInput },
      { err: checkConfirm(), focus: confirmInput },
      { err: checkAgree(), focus: agreeInput },
    ];
    const firstBad = checks.find((c) => c.err !== null);
    if (firstBad) {
      report({
        type: "register-validate-failed",
        payload: { field: firstBad.focus.id, error: firstBad.err },
        tags: { flow: "register" },
      });
      firstBad.focus.focus();
      return;
    }

    addBreadcrumb({
      category: "register",
      message: "validation passed",
      data: { username: usernameInput.value },
    });

    // mock 异步提交
    submitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "注册中…";
    formMessage.hidden = true;
    formMessage.textContent = "";

    window.setTimeout(() => {
      submitting = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "注册";

      // BUG: persist simulate-error state — once checked, survives page reload
      localStorage.setItem("demo.simulateError", simulateErrorInput.checked ? "1" : "0");

      if (simulateErrorInput.checked) {
        report({
          type: "register-server-error",
          payload: { username: usernameInput.value, email: emailInput.value },
          tags: { flow: "register" },
        });
        captureException(new Error(`simulated server error for ${usernameInput.value}`));
        formMessage.textContent = "服务端错误，请稍后重试。";
        formMessage.className = "form-message error";
        formMessage.hidden = false;
        return;
      }

      // 成功：追加到右侧列表（textContent 渲染，即使用户名含 <script> 也不会执行）
      const user: RegisteredUser = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        username: normalizeUsername(usernameInput.value),
        email: normalizeEmail(emailInput.value),
        subscribed: subscribeInput.checked,
        createdAt: new Date().toISOString(),
      };
      addBreadcrumb({
        category: "register",
        message: "user created, prepending to list",
        data: { username: user.username, email: user.email, subscribed: user.subscribed },
      });
      prependUser(user);

      report({
        type: "register-done",
        payload: { username: user.username, email: user.email },
        tags: { flow: "register" },
      });
      reportPerformance({
        name: "register-total",
        value: performance.now() - t0,
        unit: "millisecond",
      });

      formMessage.textContent = `注册成功：${user.username} 已加入右侧列表。`;
      formMessage.className = "form-message success";
      formMessage.hidden = false;

      resetForm();
      usernameInput.focus();
    }, 600);
  });

  // ---- 白屏模拟 ----
  const wsBtn = document.getElementById("btn-simulate-whitescreen");
  wsBtn?.addEventListener("click", () => {
    const root = document.querySelector<HTMLElement>("[data-monitor-root]");
    if (!root) return;
    root.innerHTML = "";
    addBreadcrumb({ category: "simulate", message: "white screen triggered" });
    report({
      type: "simulate-whitescreen",
      payload: { reason: "button-clicked" },
      tags: { flow: "simulate" },
    });
  });
}
