import { decodeMoneyCache } from "./money-cache-codec";
import { rethrowResourceError } from "./resource-error";

/** One warning per fixed cache operation per process, including write failures. */
export function createCacheFailureReporter(message: string) {
  let warned = false;
  return (error: unknown) => {
    rethrowResourceError(error);
    if (!warned) {
      console.warn(message, error);
      warned = true;
    }
  };
}

export async function readValidatedMoneyCache<T>(args: {
  read: () => Promise<string | null>;
  maxBytes: number;
  validate: (value: unknown) => value is T;
  reportFailure: (error: unknown) => void;
}): Promise<T | undefined> {
  try {
    const encoded = await args.read();
    if (!encoded || Buffer.byteLength(encoded, "utf8") > args.maxBytes) return;
    const decoded = decodeMoneyCache<unknown>(JSON.parse(encoded));
    return args.validate(decoded) ? decoded : undefined;
  } catch (error) {
    rethrowResourceError(error);
    args.reportFailure(error);
    return undefined;
  }
}
