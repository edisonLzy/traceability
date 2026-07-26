import { useCallback } from "react";

import { setTag } from "../browser/index.js";

export function useMonitorTag() {
  return useCallback((key: string, value: string) => {
    setTag(key, value);
  }, []);
}
