import { checkDeploymentArtifact } from "./build-security/artifact.ts";

await checkDeploymentArtifact();
console.info("Deployment artifact excludes E2E implementations and MSW.");
