import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import loginAnimation from "@renderer/assets/secure-login.lottie";
import { useAuth } from "@renderer/auth/AuthProvider";
import { rendererTrpcClient } from "@renderer/lib/trpc";
import { KeyRound, Loader2, Mail } from "lucide-react";
import { useState } from "react";

export function LoginPage() {
  const { accept: onAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <div className="app-drag-region relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-canvas px-6">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[460px] w-[680px] -translate-x-1/2 rounded-full bg-primary/20 blur-[130px]" />
      <form
        className="app-no-drag relative w-full max-w-[360px]"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            setLoading(true);
            setError(null);
            try {
              const result = await rendererTrpcClient.auth.login.mutate({ email, password });
              await onAuthenticated(result);
            } catch {
              setError("邮箱或密码不正确。");
            } finally {
              setLoading(false);
            }
          })();
        }}
      >
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
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-tertiary"
          />
        </label>
        <label className="mt-2 flex h-10 items-center gap-2 rounded-[9px] border border-hairline bg-white/[0.035] px-3 text-tertiary">
          <KeyRound size={14} />
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-tertiary"
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-[11px] text-danger">
            {error}
          </p>
        )}
        <button
          disabled={loading}
          className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[9px] bg-primary text-[12px] font-[650] text-[#111329] disabled:opacity-60"
        >
          {loading && <Loader2 size={14} className="animate-spin" />}登录
        </button>
      </form>
    </div>
  );
}
