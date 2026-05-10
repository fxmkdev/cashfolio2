type StartContext = unknown;

let currentContext: StartContext;

export const runWithStartContext = async <T>(
  context: StartContext,
  fn: () => T | Promise<T>,
) => {
  const previousContext = currentContext;
  currentContext = context;
  try {
    return await fn();
  } finally {
    currentContext = previousContext;
  }
};

export const getStartContext = (opts?: { throwIfNotFound?: boolean }) => {
  if (
    typeof currentContext === "undefined" &&
    (opts?.throwIfNotFound ?? true)
  ) {
    throw new Error(
      "No Start context found in Storybook start-storage-context shim.",
    );
  }

  return currentContext;
};
