import { expectTypeOf, it } from "vitest";
import {
  cacheArray,
  cacheBoolean,
  cacheEnum,
  cacheNullable,
  cacheObject,
  cacheOptional,
  cacheString,
  type CacheCheck,
} from "./cache-validation";

it("requires validators compatible with their owning field types", () => {
  expectTypeOf<
    Parameters<typeof cacheObject<{ enabled: boolean }>>[0]
  >().toEqualTypeOf<{ enabled: CacheCheck<boolean> }>();
  expectTypeOf(cacheString).not.toExtend<CacheCheck<boolean>>();
  expectTypeOf(cacheArray(cacheString)).not.toExtend<CacheCheck<boolean[]>>();
  expectTypeOf(cacheNullable(cacheBoolean)).not.toExtend<
    CacheCheck<string | null>
  >();
  expectTypeOf(cacheOptional(cacheBoolean)).toEqualTypeOf<
    CacheCheck<boolean | undefined>
  >();
  expectTypeOf(cacheEnum(["first", "second"])).toEqualTypeOf<
    CacheCheck<"first" | "second">
  >();
});
