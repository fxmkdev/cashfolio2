import { afterEach, beforeEach } from "vitest";

// Storybook 10.6 applies preview annotations automatically, including router loaders.
beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // Ignore blocked storage in constrained browser contexts.
  }

  try {
    window.sessionStorage.clear();
  } catch {
    // Ignore blocked storage in constrained browser contexts.
  }
});

// Leave data behind so the next story exercises storage isolation.
afterEach(() => {
  for (const storage of ["localStorage", "sessionStorage"] as const) {
    try {
      window[storage].setItem(
        "cashfolio-storybook-isolation",
        "previous-story",
      );
    } catch {
      // Ignore blocked storage in constrained browser contexts.
    }
  }
});
