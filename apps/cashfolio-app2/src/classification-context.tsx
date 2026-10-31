import { useRefreshedMutationData } from "./hooks/use-refreshed-mutation-data";
import { createContext, useContext, type ReactNode } from "react";
import {
  defaultAssetClassNodes,
  type ClassificationNode,
} from "./shared/asset-class";
export const AssetClassContext = createContext<readonly ClassificationNode[]>(
  defaultAssetClassNodes,
);
export const useAssetClasses = () => useContext(AssetClassContext);

const AssetClassRefreshContext = createContext<() => Promise<void>>(
  async () => {},
);
export const useRefreshAssetClasses = () =>
  useContext(AssetClassRefreshContext);

export function AssetClassProvider({
  nodes,
  loadNodes,
  children,
}: {
  nodes: readonly ClassificationNode[];
  loadNodes: () => Promise<readonly ClassificationNode[]>;
  children: ReactNode;
}) {
  const { data, refresh } = useRefreshedMutationData(nodes, loadNodes);
  return (
    <AssetClassContext.Provider value={data}>
      <AssetClassRefreshContext.Provider value={refresh}>
        {children}
      </AssetClassRefreshContext.Provider>
    </AssetClassContext.Provider>
  );
}
