import { ErrorBoundary } from "@sentry/react";
import React from "react";

export interface MonitorErrorBoundaryProps {
  appName?: string;
  fallback:
    | React.ReactNode
    | ((args: {
        error: Error;
        componentStack: string | null;
        resetError: () => void;
      }) => React.ReactNode);
  children: React.ReactNode;
  onError?: (error: Error, componentStack: string | null) => void;
}

export function MonitorErrorBoundary(props: MonitorErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={props.fallback as any}
      beforeCapture={(scope) => {
        if (props.appName) scope.setTag("appName", props.appName);
      }}
      onError={
        props.onError
          ? (error: unknown, componentStack: string | undefined) => {
              if (props.onError) props.onError(error as Error, componentStack ?? null);
            }
          : undefined
      }
      showDialog={false}
    >
      {props.children}
    </ErrorBoundary>
  );
}
