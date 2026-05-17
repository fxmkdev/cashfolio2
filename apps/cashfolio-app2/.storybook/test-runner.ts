import { getStoryContext, type TestRunnerConfig } from "@storybook/test-runner";

type ViewportSize = {
  height: number;
  width: number;
};

type TestRunnerParameters = {
  testRunner?: {
    viewport?: ViewportSize;
  };
};

const DEFAULT_VIEWPORT: ViewportSize = { width: 1280, height: 900 };

const config: TestRunnerConfig = {
  async preVisit(page, story) {
    const context = await getStoryContext(page, story);
    const { testRunner } = context.parameters as TestRunnerParameters;
    const viewport = testRunner?.viewport ?? DEFAULT_VIEWPORT;

    await page.setViewportSize(viewport);
    await page.evaluate(() => {
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
  },
};

export default config;
