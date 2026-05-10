type StartManifestRoute = {
  assets?: unknown[];
  preloads?: unknown[];
};

type StartManifest = {
  clientEntry: string;
  inlineCss: unknown[];
  routes: Record<string, StartManifestRoute>;
};

export const tsrStartManifest = (): StartManifest => {
  return {
    clientEntry: "",
    inlineCss: [],
    routes: {},
  };
};
