import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { APP_RELEASE_URL, type AppUpdateState } from "@shared/update-ipc";
import { useCallback, useEffect, useState } from "react";

const INITIAL_STATE: AppUpdateState = {
  status: "unsupported",
  currentVersion: "",
  version: null,
  releaseName: null,
  releaseDate: null,
  releaseNotes: null,
  releaseUrl: APP_RELEASE_URL,
  progress: null,
  error: null,
  userInitiated: false,
};

export function useAppUpdate() {
  const { invoke, on } = useElectronIPC();
  const [state, setState] = useState<AppUpdateState>(INITIAL_STATE);

  useEffect(() => {
    let active = true;
    const unsubscribe = on("update_state_changed", (nextState) => {
      if (active) setState(nextState);
    });

    void invoke("getAppUpdateState")
      .then((nextState) => {
        if (active) setState(nextState);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [invoke, on]);

  const checkForUpdates = useCallback(async () => {
    const nextState = await invoke("checkForAppUpdate");
    setState(nextState);
    return nextState;
  }, [invoke]);

  const downloadUpdate = useCallback(async () => {
    const nextState = await invoke("downloadAppUpdate");
    setState(nextState);
    return nextState;
  }, [invoke]);

  const installUpdate = useCallback(async () => {
    await invoke("installAppUpdate");
  }, [invoke]);

  const openReleasePage = useCallback(async () => {
    await invoke("openAppReleasePage");
  }, [invoke]);

  return { state, checkForUpdates, downloadUpdate, installUpdate, openReleasePage };
}
