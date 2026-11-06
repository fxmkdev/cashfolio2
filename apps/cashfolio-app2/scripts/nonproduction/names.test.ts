import assert from "node:assert/strict";
import test from "node:test";
import { databaseName, isManagedDatabase } from "./names.ts";

test("uses the full current branch with a stable collision-resistant suffix", () => {
  assert.equal(databaseName("main"), "cashfolio-app2-main-0d6e4079");
  assert.notEqual(databaseName("feature/a"), databaseName("feature-a"));
  assert.notEqual(databaseName("feature/a"), databaseName("fix/a"));
  assert.notEqual(databaseName("Feature/A"), databaseName("feature/a"));
  for (const branch of ["x/" + "long-".repeat(80), "$(cat /secret)", "🌿"]) {
    const name = databaseName(branch);
    assert.ok(name.length <= 63);
    assert.ok(isManagedDatabase(name));
    assert.equal(databaseName(branch), name);
  }
  assert.notEqual(databaseName("old"), databaseName("renamed"));
  for (const branch of ["", "bad\nbranch", "bad\0branch"])
    assert.throws(() => databaseName(branch));
  for (const name of [
    "neondb",
    "postgres",
    "production",
    "pr-42-old-cashfolio-app2",
    "cashfolio-app2-main-nohash",
    "cashfolio-app2--aaaaaaaa",
  ])
    assert.equal(isManagedDatabase(name), false);
});
