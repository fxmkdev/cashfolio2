import { expect, it } from "vitest";
import { getE2EMockedProviderApiKey } from "./provider-api-key";

it("provides the deterministic E2E-only API key", () => {
  expect(getE2EMockedProviderApiKey()).toBe("e2e-mocked-provider-key");
});
