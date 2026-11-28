import Decimal from "decimal.js";
import { encodeMoneyCache, decodeMoneyCache } from "../../money-cache-codec";
import { checkResourceBudget } from "../../resource-context.server";

export const RETURN_ARTIFACT_CHUNK_BYTES = 1024 * 1024;
const INLINE_BYTES = 32 * 1024;

/** A conservative, bounded walk: never encode an entire large container to size it. */
function fitsInline(value: unknown, budget: { remaining: number }): boolean {
  budget.remaining -= 2;
  if (budget.remaining < 0) return false;
  if (typeof value === "string") budget.remaining -= value.length * 6;
  else if (value instanceof Date || Decimal.isDecimal(value))
    budget.remaining -= JSON.stringify(encodeMoneyCache(value)).length;
  else if (Array.isArray(value)) {
    for (const item of value) if (!fitsInline(item, budget)) return false;
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      budget.remaining -= key.length * 6 + 4;
      if (!fitsInline(item, budget)) return false;
    }
  } else budget.remaining -= 32;
  return budget.remaining >= 0;
}

/** Small records remain ordinary money-cache JSON; only large containers are split. */
function* records(value: unknown, depth = 0): Generator<string> {
  if (depth > 128)
    throw new Error("Return artifact nesting exceeds its supported depth.");
  if (fitsInline(value, { remaining: INLINE_BYTES })) {
    yield JSON.stringify(["v", encodeMoneyCache(value)]);
    return;
  }
  if (typeof value === "string") {
    yield '["s"]';
    // JSON escapes lone surrogates, so even a split surrogate pair round-trips exactly.
    for (let offset = 0; offset < value.length; offset += 8192)
      yield JSON.stringify(["v", value.slice(offset, offset + 8192)]);
  } else if (Array.isArray(value)) {
    yield '["a"]';
    for (const item of value) yield* records(item, depth + 1);
  } else if (value && typeof value === "object") {
    yield '["o"]';
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      yield* records(key, depth + 1);
      yield* records(item, depth + 1);
    }
  } else throw new Error("Invalid return artifact value.");
  yield '["e"]';
}

/** Each newline-delimited chunk can be parsed independently, without joining the snapshot. */
export function* encodeReturnArtifact(value: unknown): Generator<string> {
  let lines: string[] = [];
  let bytes = 0;
  let count = 0;
  for (const line of records(value)) {
    if (++count % 256 === 0) checkResourceBudget();
    const size = Buffer.byteLength(line) + 1;
    if (size > RETURN_ARTIFACT_CHUNK_BYTES)
      throw Object.assign(
        new Error("Return artifact record exceeds its chunk size."),
        {
          recordBytes: size,
          chunkLimitBytes: RETURN_ARTIFACT_CHUNK_BYTES,
        },
      );
    if (bytes + size > RETURN_ARTIFACT_CHUNK_BYTES) {
      yield lines.join("\n") + "\n";
      lines = [];
      bytes = 0;
    }
    lines.push(line);
    bytes += size;
  }
  if (lines.length) yield lines.join("\n") + "\n";
}

type Frame =
  | { kind: "a"; value: unknown[] }
  | { kind: "s"; value: string[] }
  | { kind: "o"; value: Record<string, unknown>; key?: string };

export function createReturnArtifactDecoder() {
  const stack: Frame[] = [];
  let root: unknown;
  let complete = false;
  const invalid = () => {
    throw new Error("Invalid return artifact chunk stream.");
  };
  const accept = (value: unknown) => {
    const frame = stack.at(-1);
    if (!frame) {
      if (complete) invalid();
      root = value;
      complete = true;
    } else if (frame.kind === "a") frame.value.push(value);
    else if (frame.kind === "s") {
      if (typeof value !== "string") invalid();
      frame.value.push(value as string);
    } else if (frame.key === undefined) {
      if (typeof value !== "string" || Object.hasOwn(frame.value, value))
        invalid();
      frame.key = value as string;
    } else {
      // Match JSON.parse's own-property semantics, including __proto__.
      Object.defineProperty(frame.value, frame.key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      frame.key = undefined;
    }
  };
  return {
    append(raw: string) {
      if (!raw.endsWith("\n")) invalid();
      for (const line of raw.slice(0, -1).split("\n")) {
        let token: unknown;
        try {
          token = JSON.parse(line);
        } catch {
          // Native parse errors can include a fragment of the financial payload.
          return invalid();
        }
        if (!Array.isArray(token)) return invalid();
        if (token[0] === "v" && token.length === 2)
          accept(decodeMoneyCache(token[1]));
        else if (token.length !== 1) invalid();
        else if (["o", "a", "s"].includes(token[0])) {
          if (complete || stack.length >= 128) invalid();
          if (token[0] === "o") stack.push({ kind: "o", value: {} });
          else if (token[0] === "a") stack.push({ kind: "a", value: [] });
          else stack.push({ kind: "s", value: [] });
        } else if (token[0] === "e") {
          const frame = stack.pop();
          if (!frame || (frame.kind === "o" && frame.key !== undefined))
            return invalid();
          accept(frame.kind === "s" ? frame.value.join("") : frame.value);
        } else invalid();
      }
    },
    finish(): unknown {
      if (!complete || stack.length) invalid();
      return root;
    },
  };
}
