import { cn } from "@renderer/lib/utils";
import { Bot } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

type SettingsSection = "models";

const SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  path: string;
  icon: typeof Bot;
}> = [{ id: "models", label: "模型", path: "/settings/models", icon: Bot }];

export function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeSectionLabel =
    SECTIONS.find((section) => location.pathname.startsWith(section.path))?.label ?? "设置";

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ paddingTop: "var(--titlebar-height)" } as React.CSSProperties}
    >
      {/* Left sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-hairline bg-transparent">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="glass-control flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-muted hover:border-hairline-strong hover:bg-surface-2 hover:text-ink"
          >
            ← 返回应用
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-1 px-2 pb-1 text-[10px] font-[600] uppercase tracking-widest text-tertiary">
            设置
          </div>
          <ul className="flex flex-col gap-0.5">
            {SECTIONS.map((section) => {
              const SectionIcon = section.icon;
              return (
                <li key={section.id}>
                  <NavLink
                    to={section.path}
                    className={({ isActive }) =>
                      cn(
                        "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-[13px] transition-[color,background-color,border-color,box-shadow]",
                        isActive
                          ? "bg-primary/10 text-primary-hover"
                          : "text-muted hover:bg-overlay-strong hover:text-ink",
                      )
                    }
                  >
                    <SectionIcon size={14} className="shrink-0 opacity-80" />
                    <span>{section.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Right content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center border-b border-hairline px-5">
          <h1 className="text-sm font-[650] tracking-tight text-ink">{activeSectionLabel}</h1>
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
