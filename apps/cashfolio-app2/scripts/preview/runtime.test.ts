import assert from "node:assert/strict";
import test from "node:test";
import { serializeFlySecrets, stageFlySecrets } from "./runtime.ts";

test("Fly stdin serialization preserves literal JSON, punctuation and dollar signs without JSON escapes", () => {
  const target =
    '{"environment":"preview","database":"pr-42-title-cashfolio-app2"}';
  assert.equal(
    serializeFlySecrets({ SEED_TARGET: target, TOKEN: "a$b#c=d" }),
    `SEED_TARGET="""${target}"""\nTOKEN="""a$b#c=d"""\n`,
  );
  for (const value of ["line\nbreak", 'triple"""quote', 'quote"before#comment'])
    assert.throws(() => serializeFlySecrets({ TOKEN: value }));
});

test("shared staging masks individual identities and passes validated secrets through stdin only", async (context) => {
  const log = context.mock.method(console, "log", () => {});
  const calls: { args: string[]; input?: string }[] = [];
  const run = async (args: string[], input?: string) => {
    calls.push({ args, input });
    return "";
  };
  const secrets = {
    SEED_USER_EXTERNAL_IDS: "admin,tester",
    SEED_ADMIN_EXTERNAL_IDS: "admin",
    SEED_TARGET: '{"projectId":"project"}',
    SESSION_SECRET: "session-secret",
  };
  await stageFlySecrets("preview-app", secrets, run);
  assert.deepEqual(calls, [
    {
      args: ["secrets", "import", "--app", "preview-app", "--stage"],
      input: serializeFlySecrets(secrets),
    },
  ]);
  const masks = log.mock.calls.map((call) => call.arguments[0]);
  for (const value of [...Object.values(secrets), "admin", "tester"])
    assert.ok(masks.includes(`::add-mask::${value}`));
  calls.length = 0;
  await assert.rejects(
    stageFlySecrets("preview-app", { TOKEN: "bad\nsecret" }, run),
  );
  assert.equal(calls.length, 0);
});
