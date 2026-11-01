import assert from "node:assert/strict";
import test from "node:test";
import { publishedImage } from "./resolve-image.ts";

const sha = "a".repeat(40);
const digest = `registry.fly.io/cashfolio-staging@sha256:${"b".repeat(64)}`;
const build = {
  image: `registry.fly.io/cashfolio-staging:pr-${sha}-123-1`,
  imageApp: "cashfolio-staging",
  number: 42,
  sha,
};

test("waits for a Depot image to become readable and records the shared repository digest", async () => {
  const calls: string[][] = [];
  const pauses: number[] = [];
  let pulls = 0;
  const result = await publishedImage(build, {
    run: async (args) => {
      calls.push(args);
      if (args[0] === "pull") {
        if (++pulls < 3) throw new Error("manifest unknown");
        return "pulled";
      }
      return JSON.stringify([
        `registry.fly.io/other-app@sha256:${"c".repeat(64)}`,
        digest,
      ]);
    },
    pause: async (milliseconds) => {
      pauses.push(milliseconds);
    },
  });
  assert.equal(result, digest);
  assert.deepEqual(pauses, [20_000, 20_000]);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.at(-1), [
    "image",
    "inspect",
    build.image,
    "--format",
    "{{json .RepoDigests}}",
  ]);
});

test("bounds retries, suppresses raw command errors and never inspects a failed pull", async () => {
  let pulls = 0;
  let pauses = 0;
  await assert.rejects(
    publishedImage(build, {
      run: async (args) => {
        assert.equal(args[0], "pull");
        pulls++;
        throw new Error("sensitive-provider-diagnostic");
      },
      pause: async () => {
        pauses++;
      },
    }),
    { message: "The published preview image did not become available." },
  );
  assert.equal(pulls, 7);
  assert.equal(pauses, 6);
});

test("rejects other repositories, mutable tags and wrong commits before invoking Docker", async () => {
  for (const changed of [
    { ...build, image: build.image.replace("cashfolio-staging", "other-app") },
    { ...build, image: "registry.fly.io/cashfolio-staging:latest" },
    { ...build, sha: "c".repeat(40) },
    { ...build, imageApp: "app; echo unsafe" },
    { ...build, number: -1 },
  ]) {
    let calls = 0;
    await assert.rejects(
      publishedImage(changed, {
        run: async () => {
          calls++;
          return "";
        },
        pause: async () => {
          assert.fail("No retries for invalid input");
        },
      }),
    );
    assert.equal(calls, 0);
  }
});

test("fails closed on invalid inspection data instead of publishing a tag or an unrelated digest", async () => {
  for (const response of [
    "not-json",
    "null",
    JSON.stringify([]),
    JSON.stringify([build.image]),
    JSON.stringify([digest.replace("cashfolio-staging", "other-app")]),
    JSON.stringify([digest + "\nINJECT=true"]),
  ])
    await assert.rejects(
      publishedImage(build, {
        run: async (args) => (args[0] === "pull" ? "pulled" : response),
        pause: async () => {
          assert.fail("Inspection failures must not retry pulls");
        },
      }),
    );
});
