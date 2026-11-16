export function readRefreshArguments(args: string[]) {
  if (
    args.length > 1 ||
    args.some((arg) => !["--smoke", "--if-missing"].includes(arg))
  ) {
    throw new Error(
      "Use either --smoke, --if-missing, or no refresh arguments.",
    );
  }
  return {
    smoke: args.includes("--smoke"),
    onlyIfMissing: args.includes("--if-missing"),
  };
}
