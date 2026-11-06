import assert from "node:assert/strict";
import test from "node:test";
import { serializeFlySecrets } from "./runtime.ts";

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
