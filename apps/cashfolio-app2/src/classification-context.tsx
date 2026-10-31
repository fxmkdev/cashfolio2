import { createContext, useContext } from "react";
import {
  defaultAssetClassNodes,
  type ClassificationNode,
} from "./shared/asset-class";
export const AssetClassContext = createContext<readonly ClassificationNode[]>(
  defaultAssetClassNodes,
);
export const useAssetClasses = () => useContext(AssetClassContext);
