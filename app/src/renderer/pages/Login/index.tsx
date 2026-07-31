import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import loginAnimation from "@renderer/assets/secure-login.lottie";
import { rendererTrpcClient } from "@renderer/lib/trpc";
import { authStore } from "@renderer/store/auth";
import type { AppRouterInputs } from "@shared/trpc-types";
import { KeyRound, Loader2, Mail } from "lucide-react";
import { useForm } from "react-hook-form";

// 表单字段类型直接复用服务端 auth.login 的 input schema，避免两端重复定义。
type LoginFormValues = AppRouterInputs["auth"]["login"];

export function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await rendererTrpcClient.auth.login.mutate(data);
    await authStore.getState().completeLogin(result);
  });

  return (
    <div className="app-drag-region relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-canvas px-6">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[460px] w-[680px] -translate-x-1/2 rounded-full bg-primary/20 blur-[130px]" />
      <form className="app-no-drag relative w-full max-w-[360px]" onSubmit={onSubmit}>
        <DotLottieReact
          src={loginAnimation}
          autoplay
          loop
          aria-hidden="true"
          className="mb-4 h-52 w-52"
        />
        <h1 className="m-0 text-[22px] font-[670] tracking-[-0.03em] text-ink">
          登录 Traceability
        </h1>
        <p className="mt-2 text-[12px] leading-relaxed text-tertiary">
          使用系统分配的邮箱和密码继续。当前不开放注册。
        </p>
        <label className="mt-5 flex h-10 items-center gap-2 rounded-[9px] border border-hairline bg-white/[0.035] px-3 text-tertiary">
          <Mail size={14} />
          <input
            type="email"
            {...register("email", {
              required: "请输入邮箱地址。",
              pattern: { value: /^\S+@\S+$/i, message: "请输入有效的邮箱地址。" },
            })}
            placeholder="邮箱"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-tertiary"
          />
        </label>
        {errors.email && (
          <p role="alert" className="mt-1 text-[11px] text-danger">
            {errors.email.message}
          </p>
        )}
        <label className="mt-2 flex h-10 items-center gap-2 rounded-[9px] border border-hairline bg-white/[0.035] px-3 text-tertiary">
          <KeyRound size={14} />
          <input
            type="password"
            {...register("password", { required: "请输入密码。" })}
            placeholder="密码"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-tertiary"
          />
        </label>
        {errors.password && (
          <p role="alert" className="mt-1 text-[11px] text-danger">
            {errors.password.message}
          </p>
        )}
        <button
          disabled={isSubmitting}
          className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[9px] bg-primary text-[12px] font-[650] text-[#111329] disabled:opacity-60"
        >
          {isSubmitting && <Loader2 size={14} className="animate-spin" />}登录
        </button>
      </form>
    </div>
  );
}
