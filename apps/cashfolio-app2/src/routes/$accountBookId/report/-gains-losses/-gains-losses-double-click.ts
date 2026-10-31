import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import type { GainsLossesWaterfallDatum } from "./-gains-losses-waterfall-model";

export function handleGainsLossesDoubleClick(args: {
  event: Event;
  handledEvents: WeakSet<Event>;
  datum: GainsLossesWaterfallDatum;
  currentNodes: GainsLossesBreakdownNode[];
  path: string[];
  onOpenAccount?: (accountId: string) => void;
  onDrill: (path: string[]) => void;
}) {
  // AG Charts and the React container receive the same native event. Retain
  // consumption across renders so a newly displayed account cannot handle it.
  if (args.handledEvents.has(args.event)) return;
  args.handledEvents.add(args.event);
  const node = args.currentNodes.find(
    (candidate) => candidate.id === args.datum.id,
  );
  if (!node) return;
  if (node.account) {
    args.onOpenAccount?.(node.account.id);
  } else if (node.children.length && !args.path.includes(node.id)) {
    args.onDrill([...args.path, node.id]);
  }
}
