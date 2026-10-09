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
  window.localStorage.setItem(
    "cashfolio-storybook-isolation",
    "previous-story",
  );
  window.sessionStorage.setItem(
    "cashfolio-storybook-isolation",
    "previous-story",
  );
});
