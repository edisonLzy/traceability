#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { Command, CommanderError } from "commander";

import { authCommand } from "./commands/auth.js";
import { configCommand } from "./commands/config.js";
import { issueCommand } from "./commands/issue.js";
import { metricCommand } from "./commands/metric.js";
import { projectCommand } from "./commands/project.js";
import { sourcemapCommand } from "./commands/sourcemap.js";
import { traceCommand } from "./commands/trace.js";
import { AuthCancelledError, AuthRequiredError } from "./lib/auth.js";
import { getConfig, setConfigOverrides } from "./lib/config.js";

const require = createRequire(import.meta.url);

/** commander 错误码 → 按 CACError 语义映射到 exit 2 */
const PARSE_ERROR_CODES = new Set([
  "commander.missingArgument",
  "commander.missingMandatoryOptionValue",
  "commander.unknownOption",
  "commander.unknownCommand",
  "commander.excessArguments",
  // help-with-error:子命令缺省或未知命令时 commander 打印帮助并抛此码
  "commander.help",
]);

export function createProgram(): Command {
  const program = new Command();
  program
    .name("traceability")
    .description("Traceability CLI")
    .version(require("../package.json").version as string)
    .option("--server <url>", "server URL override")
    .exitOverride();
  program.hook("preAction", (_thisCommand, actionCommand) => {
    const opts = actionCommand.optsWithGlobals() as { server?: string };
    setConfigOverrides({ server: typeof opts.server === "string" ? opts.server : undefined });
  });
  authCommand(program);
  configCommand(program);
  projectCommand(program);
  issueCommand(program);
  metricCommand(program);
  traceCommand(program);
  sourcemapCommand(program);
  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = createProgram();
  try {
    await program.parseAsync(argv);
  } catch (err) {
    // commander 用 exitOverride 让 --help/--version 抛出 exitCode 0 的
    // CommanderError;帮助/版本已打印,不能算失败。
    if (err instanceof CommanderError && err.exitCode === 0) return;
    throw err;
  }
}

export function reportError(err: unknown): void {
  if (err instanceof AuthCancelledError) {
    console.error("Aborted.");
    process.exitCode = 130;
    return;
  }
  if (err instanceof CommanderError) {
    // commander 已经把错误/help-with-error 写到 stderr;这里只负责映射退出码。
    if (PARSE_ERROR_CODES.has(err.code)) {
      process.exitCode = 2;
      return;
    }
    if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
      // --help / --version 正常显示,不设非零退出码
      process.exitCode = 0;
      return;
    }
    // commander.help(help-with-error)以及其它 commander 错误:沿用其 exitCode
    process.exitCode = err.exitCode || 1;
    return;
  }
  if (err instanceof AuthRequiredError) {
    // 与 fix-loop 命令的 exit 2 约定一致,但要让用户看到具体原因。
    console.error(err.message);
    process.exitCode = 2;
    return;
  }
  if (isNetworkError(err)) {
    // tRPC 的 httpBatchLink 用全局 fetch,连不上服务器时抛出笼统的
    // "fetch failed"(TypeError);把它换成带服务器地址的可操作提示。
    const server = getConfig().server;
    console.error(`Cannot reach server: ${server}`);
    console.error("Check that the server is running and the URL is correct.");
    console.error("Run `traceability config set --server <url>` to change the server URL.");
    process.exitCode = 1;
    return;
  }
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}

/** 识别 Node fetch 的网络层失败(连不上/拒绝连接/DNS),区别于服务器返回的业务错误。 */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message === "fetch failed") return true;
  if (err instanceof Error) {
    // tRPC 把 fetch 失败包装成 TRPCClientError,message 保持原样。
    return err.message === "fetch failed" || err.message.startsWith("Failed to parse URL");
  }
  return false;
}

// 入口检测:全局链接时 node 从符号链接路径加载,import.meta.url 会解析到
// 真实路径而 process.argv[1] 保留链接路径,二者不一致会静默跳过执行,
// 所以先用 realpath 归一化再比较。
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  void runCli().catch(reportError);
}
