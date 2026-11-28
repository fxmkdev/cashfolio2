import { expect, it } from "vitest";
import {
  createReturnArtifactDecoder,
  encodeReturnArtifact,
} from "./return-artifact-codec.server";

it("preserves large nested collections and own __proto__ keys without prototype mutation", () => {
  const input = JSON.parse('{"__proto__":{"safe":true},"values":[]}') as {
    values: unknown[];
  };
  input.values = Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    rows: [{ value: `row-${i}` }],
  }));
  const decoder = createReturnArtifactDecoder();
  for (const chunk of encodeReturnArtifact(input)) decoder.append(chunk);
  const output = decoder.finish();
  expect(output).toEqual(input);
  expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
  expect(Object.hasOwn(output as object, "__proto__")).toBe(true);
});
it.each([
  '["v",1]',
  "financial-secret invalid JSON\n",
  "{}\n",
  '["v",1,2]\n',
  '["unknown"]\n',
  '["e"]\n',
  '["v",1]\n["v",2]\n',
  '["o"]\n["v",1]\n',
  '["o"]\n["v","key"]\n["e"]\n',
  '["o"]\n["v","key"]\n["v",1]\n["v","key"]\n',
  '["s"]\n["v",1]\n',
  '["a"]\n'.repeat(129),
])(
  "rejects malformed record streams without exposing financial payloads",
  (raw) => {
    const decoder = createReturnArtifactDecoder();
    expect(() => decoder.append(raw)).toThrow(
      "Invalid return artifact chunk stream.",
    );
  },
);
it("rejects unfinished containers and missing roots", () => {
  const empty = createReturnArtifactDecoder();
  expect(() => empty.finish()).toThrow("Invalid return artifact chunk stream.");
  empty.append('["a"]\n["v",1]\n');
  expect(() => empty.finish()).toThrow("Invalid return artifact chunk stream.");
});
