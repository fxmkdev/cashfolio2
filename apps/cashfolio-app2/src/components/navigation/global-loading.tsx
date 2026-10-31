import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { nprogress } from "@mantine/nprogress";
import { createGlobalLoadingController } from "./global-loading-controller";

const GlobalLoadingContext = createContext<
  ReturnType<typeof createGlobalLoadingController> | undefined
>(undefined);

export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => createGlobalLoadingController(nprogress));
  useEffect(() => () => controller.reset(), [controller]);
  return (
    <GlobalLoadingContext.Provider value={controller}>
      {children}
    </GlobalLoadingContext.Provider>
  );
}

/** Register page-level client work; cleanup releases only this caller's task. */
export function useGlobalLoading(active: boolean) {
  const controller = useContext(GlobalLoadingContext);
  if (!controller) throw new Error("GlobalLoadingProvider is required.");
  useEffect(() => {
    if (active) return controller.begin();
  }, [active, controller]);
}
