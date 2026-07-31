import type { Issue } from "@renderer/lib/trpc-types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "18 sec ago", "4 min ago", "2 hr ago", "1 day ago", else locale date. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

/** Display-ready source location for an issue's origin frame. */
export function issueSource(issue: Issue): string {
  return issue.title || issue.fingerprint.slice(0, 12);
}

export type IssueStatus = "unresolved" | "resolved" | "ignored";
export type StatusGroup = IssueStatus;

export function statusGroup(status: string): StatusGroup {
  if (status === "resolved") return "resolved";
  if (status === "ignored") return "ignored";
  return "unresolved";
}

export function statusLabel(status: string): string {
  const group = statusGroup(status);
  return group === "unresolved" ? "Open" : group === "resolved" ? "Resolved" : "Ignored";
}
