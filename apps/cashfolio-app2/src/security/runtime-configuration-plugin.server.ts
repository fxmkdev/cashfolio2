import { assertSafeRuntimeConfiguration } from "./runtime-configuration";

// Nitro's Node entry invokes synchronous plugins before opening its listener.
export default function validateRuntimeConfiguration(): void {
  assertSafeRuntimeConfiguration(__E2E_BUILD__, process.env);
}
