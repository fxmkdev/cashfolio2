// The explicit import uses native Temporal when available and a synchronous
// fallback in browsers such as Safari, without modifying global objects.
export { Temporal } from "temporal-polyfill";
