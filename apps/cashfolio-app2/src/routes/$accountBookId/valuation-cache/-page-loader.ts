import { getValuationCacheUnits } from "@/server/valuation-cache";

export async function loadValuationCachePageData(args: {
  accountBookId: string;
}) {
  return getValuationCacheUnits({
    data: {
      accountBookId: args.accountBookId,
    },
  });
}
