import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GridApi, IRowNode } from "ag-grid-enterprise";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useTransactionScroll } from "./use-transaction-scroll";

type Row = { transactionId: string };

function setup(transactionId?: string) {
  let result!: ReturnType<typeof useTransactionScroll<Row>>;
  const navigate = vi.fn();
  function Harness() {
    result = useTransactionScroll<Row>(transactionId, navigate);
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  const nodes = [
    { data: { transactionId: "other" } },
    { data: { transactionId: "target" } },
    { data: { transactionId: "target" } },
  ] as IRowNode<Row>[];
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  const api = {
    forEachNode: (callback: (node: IRowNode<Row>) => void) =>
      nodes.forEach(callback),
    ensureNodeVisible: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    flashCells: vi.fn(),
  };
  return {
    result,
    navigate,
    nodes,
    api,
    update: () =>
      result.handleRowDataUpdated({ api: api as unknown as GridApi<Row> }),
    flushFrames: () => {
      while (frames.length) frames.shift()!(0);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("transaction scroll targets", () => {
  test("exposes and consumes a navigation target once, preserving other search values", () => {
    const { result, navigate, api, nodes, update, flushFrames } =
      setup("target");
    expect(result.getScrollTarget()).toBe("target");
    update();
    expect(result.getScrollTarget()).toBeUndefined();
    expect(navigate).toHaveBeenCalledOnce();
    const navigation = navigate.mock.calls[0]![0];
    expect(navigation.replace).toBe(true);
    expect(
      navigation.search({ period: "2026-05", transactionId: "target" }),
    ).toEqual({ period: "2026-05", transactionId: undefined });
    expect(api.ensureNodeVisible).toHaveBeenCalledWith(nodes[2], "middle");
    flushFrames();
    expect(api.flashCells).toHaveBeenCalledExactlyOnceWith({
      rowNodes: nodes.slice(1),
    });
    update();
    expect(navigate).toHaveBeenCalledOnce();
  });

  test("prioritizes mutation targets and supports updates without a full grid event", () => {
    const { result, navigate, api, update } = setup("other");
    expect(result.getScrollTarget()).toBe("other");
    result.pendingScrollRef.current = "target";
    expect(result.getScrollTarget()).toBe("target");
    update();
    expect(result.getScrollTarget()).toBeUndefined();
    expect(result.pendingScrollRef.current).toBeUndefined();
    expect(api.ensureNodeVisible).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  test("consumes a missing target without scrolling or flashing unrelated rows", () => {
    const { result, api, update, flushFrames } = setup("missing");
    update();
    flushFrames();
    expect(result.getScrollTarget()).toBeUndefined();
    expect(api.ensureNodeVisible).not.toHaveBeenCalled();
    expect(api.flashCells).not.toHaveBeenCalled();
  });
});
