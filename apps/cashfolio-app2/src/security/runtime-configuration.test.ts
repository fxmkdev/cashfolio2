import { describe, expect, it } from "vitest";
import { assertSafeRuntimeConfiguration } from "./runtime-configuration";

const valid = {
  APP_ENVIRONMENT: "e2e",
  HOST: "127.0.0.1",
  BASE_URL: "http://127.0.0.1:4173",
};

describe("runtime build boundary", () => {
  it.each([
    {},
    { APP_ENVIRONMENT: "prod" },
    { APP_ENVIRONMENT: "staging" },
    { APP_ENVIRONMENT: "preview" },
  ])("accepts normal configuration %j", (env) => {
    expect(() => assertSafeRuntimeConfiguration(false, env)).not.toThrow();
  });
  it("rejects the E2E environment in normal builds", () => {
    expect(() =>
      assertSafeRuntimeConfiguration(false, { APP_ENVIRONMENT: "e2e" }),
    ).toThrow(
      "Unsafe E2E configuration: APP_ENVIRONMENT=e2e requires an E2E build.",
    );
  });
  it.each(["127.0.0.1", "localhost", "::1"])(
    "accepts explicit loopback %s",
    (host) => {
      const urlHost = host === "::1" ? "[::1]" : host;
      expect(() =>
        assertSafeRuntimeConfiguration(true, {
          ...valid,
          HOST: host,
          BASE_URL: `http://${urlHost}:4173`,
        }),
      ).not.toThrow();
    },
  );
  it.each([undefined, "prod", "production", "staging", "preview"])(
    "rejects E2E deployment environment %s",
    (APP_ENVIRONMENT) => {
      expect(() =>
        assertSafeRuntimeConfiguration(true, { ...valid, APP_ENVIRONMENT }),
      ).toThrow("APP_ENVIRONMENT");
    },
  );
  it.each([undefined, "0.0.0.0", "::", "example.com", "127.0.0.1.example.com"])(
    "rejects unsafe listening host %s",
    (HOST) => {
      expect(() =>
        assertSafeRuntimeConfiguration(true, { ...valid, HOST }),
      ).toThrow("NITRO_HOST/HOST");
    },
  );
  it("uses Nitro host precedence and its empty-string fallback", () => {
    expect(() =>
      assertSafeRuntimeConfiguration(true, { ...valid, NITRO_HOST: "0.0.0.0" }),
    ).toThrow("NITRO_HOST/HOST");
    expect(() =>
      assertSafeRuntimeConfiguration(true, {
        ...valid,
        HOST: "0.0.0.0",
        NITRO_HOST: "::1",
      }),
    ).not.toThrow();
    expect(() =>
      assertSafeRuntimeConfiguration(true, { ...valid, NITRO_HOST: "" }),
    ).not.toThrow();
  });
  it.each([
    undefined,
    "invalid",
    "/relative",
    "file:///etc/passwd",
    "https://example.com",
    "http://127.0.0.1.example.com",
    "http://user:secret@localhost",
  ])("rejects unsafe BASE_URL without logging its contents: %s", (BASE_URL) => {
    expect(() =>
      assertSafeRuntimeConfiguration(true, { ...valid, BASE_URL }),
    ).toThrow("BASE_URL must be");
    expect(() =>
      assertSafeRuntimeConfiguration(true, { ...valid, BASE_URL }),
    ).not.toThrow("secret");
  });
  it("does not use NODE_ENV as the E2E switch", () => {
    expect(() =>
      assertSafeRuntimeConfiguration(true, {
        ...valid,
        NODE_ENV: "production",
      }),
    ).not.toThrow();
  });
});
