import { afterEach, beforeEach, expect, it, vi } from "vitest";
const getCookie = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start/server", () => ({ getCookie }));
import { getE2EAuthenticationContext } from "./auth.server";
import { E2E_AUTH_EXTERNAL_ID_COOKIE } from "./auth-cookie";

beforeEach(() => {
  getCookie.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  ["cookie-user", "configured-user", "cookie-user"],
  [undefined, "configured-user", "configured-user"],
  [undefined, undefined, "e2e-user"],
])(
  "selects the existing identity fallback: %s / %s",
  (cookie, configuredId, expectedId) => {
    getCookie.mockReturnValue(cookie);
    vi.stubEnv("E2E_AUTH_EXTERNAL_ID", configuredId);
    expect(getE2EAuthenticationContext()).toMatchObject({
      isAuthenticated: true,
      claims: { sub: expectedId },
    });
    expect(getCookie).toHaveBeenCalledWith(E2E_AUTH_EXTERNAL_ID_COOKIE);
  },
);
it("keeps an empty identity anonymous", () => {
  getCookie.mockReturnValue("");
  expect(getE2EAuthenticationContext()).toBeNull();
});
