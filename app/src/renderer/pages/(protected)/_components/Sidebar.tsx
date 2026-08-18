import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@renderer/components/ui/sidebar";
import { useIssues } from "@renderer/hooks/use-issues";
import { cn } from "@renderer/lib/utils";
import { projectStore } from "@renderer/store/project";
import { Activity, Bug, Compass, FileCode2, Inbox, Settings, type LucideIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore } from "zustand";

type NavigationItem = {
  icon: LucideIcon;
  label: string;
  to: string;
  badge?: number;
};

export function Sidebar() {
  return (
    <SidebarRoot
      aria-label="Primary navigation"
      className="glass-panel relative z-20 w-[56px] shrink-0 overflow-visible rounded-[18px] px-2 py-3"
    >
      <SidebarContent className="items-center">
        <SidebarGroup className="items-center">
          <SidebarGroupContent>
            <SidebarMenu className="items-center">
              <SidebarNavLink to="/inbox" icon={Inbox} label="Inbox" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="items-center pt-3">
          <SidebarGroupContent>
            <SidebarMenu className="items-center">
              <MonitorNavigation />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="items-center pt-3">
          <SidebarGroupContent>
            <SidebarMenu className="items-center">
              <SidebarNavLink to="/explorer" icon={Compass} label="Explorer" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="items-center pb-1">
        <SidebarMenu className="items-center">
          <SidebarNavLink to="/settings" icon={Settings} label="Settings" />
        </SidebarMenu>
      </SidebarFooter>
    </SidebarRoot>
  );
}

function SidebarNavLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const active = location.pathname === to || location.pathname.startsWith(`${to}/`);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        title={label}
        aria-label={label}
        isActive={active}
        onClick={() => navigate(to)}
        className={cn(
          "size-8 border border-transparent bg-transparent text-tertiary transition-[color,background-color,box-shadow] hover:border-hairline hover:bg-overlay-strong hover:text-ink",
          active && "border-primary/20 bg-primary/10 text-primary-hover shadow-glass-sm",
        )}
      >
        <Icon size={15} className={cn(active && "text-primary-hover")} />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function MonitorNavigation() {
  const projectId = useStore(projectStore, (s) => s.currentProject?.id ?? "");
  const { data } = useIssues({ projectId, limit: 100 });

  return (
    <SidebarNavigationMenu
      label="Monitor"
      icon={Activity}
      items={[
        {
          icon: Bug,
          label: "Issues",
          to: "/monitor/issues",
          badge: data?.data.filter((issue) => issue.status === "unresolved").length ?? 0,
        },
        {
          icon: FileCode2,
          label: "Sourcemaps",
          to: "/monitor/sourcemaps",
        },
      ]}
    />
  );
}

function SidebarNavigationMenu({
  label,
  icon: Icon,
  items,
}: {
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = items.some((item) => location.pathname.startsWith(item.to));

  return (
    <DropdownMenu>
      <SidebarMenuItem>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              type="button"
              title={label}
              aria-label={label}
              isActive={isActive}
              className={cn(
                "size-8 border border-transparent bg-transparent text-tertiary transition-[color,background-color,box-shadow] hover:border-hairline hover:bg-overlay-strong hover:text-ink",
                isActive && "border-primary/20 bg-primary/10 text-primary-hover shadow-glass-sm",
              )}
            />
          }
        >
          <Icon size={15} className={cn(isActive && "text-primary-hover")} />
        </DropdownMenuTrigger>
      </SidebarMenuItem>
      <DropdownMenuContent side="right" sideOffset={8} align="start" className="w-[218px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {items.map((item) => {
            const active = location.pathname.startsWith(item.to);
            const ItemIcon = item.icon;
            return (
              <DropdownMenuItem
                key={item.to}
                label={item.label}
                onClick={() => navigate(item.to)}
                className={cn(active && "bg-primary/15 font-[610] text-ink")}
              >
                <ItemIcon size={14} />
                <span>{item.label}</span>
                {item.badge !== undefined ? (
                  <span
                    className={cn(
                      "ml-auto text-[11px] tabular-nums text-tertiary",
                      active && "text-primary-hover",
                    )}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
