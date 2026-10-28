import { checkDeploymentArtifact } from "./build-security/artifact.ts";
import { checkRuntimeBoundaries } from "./build-security/runtime.ts";

await checkDeploymentArtifact();
await checkRuntimeBoundaries();
console.info("Built artifacts enforce the E2E security boundary.");
