import type { StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { securitySearchStoryMeta, controllerStoryMeta } from "./story-meta";

type SearchStory = StoryObj<typeof securitySearchStoryMeta>;
type ControllerStory = StoryObj<typeof controllerStoryMeta>;

export const serverSideBrowsingView = {
  parameters: {
    manualSetup:
      "Select Search, choose a listing, and explore price ranges and pages. Close Details and use Fixture Back/Forward to restore committed views. Editing Security or Exchange alone does not search. Search MYST for unknown ISIN or ARCH for metadata without history.",
  },
} satisfies ControllerStory;

export const obsoleteHistoryResponseView = {
  args: { scenario: "obsolete" },
  parameters: {
    manualSetup:
      "Select Search, then ALP on NASDAQ and ALP on SIX Swiss Exchange. Select Release Previous Response to finish the older history request.",
  },
} satisfies ControllerStory;

export const resultsRequestErrorView = {
  args: { scenario: "resultsError" },
  parameters: {
    manualSetup:
      "Select Search to show the results failure. Select Retry Results, inspect the pending rows, then select Release Previous Response to finish recovery.",
  },
} satisfies ControllerStory;

export const obsoleteSearchResponseView = {
  args: { scenario: "obsoleteSearch" },
  parameters: {
    manualSetup:
      "Search for Alpine, then search for Harbor while the first response is pending. Select Release Previous Response to complete the older search.",
  },
} satisfies ControllerStory;

export const exchangeDirectoryRetryView = {
  args: { scenario: "exchangesError" },
  parameters: {
    manualSetup:
      "Open Exchange to show the directory failure. Dismiss the dropdown and select Retry Exchanges, then Search.",
  },
} satisfies ControllerStory;

export const selectedHistoryRetryView = {
  args: { scenario: "historyError" },
  parameters: {
    manualSetup:
      "Select Search, choose ALP on SIX Swiss Exchange, then select Retry Price History to recover from its first failure.",
  },
} satisfies ControllerStory;

export const partialPriceHistoryView = {
  args: { scenario: "partial" },
  parameters: {
    manualSetup:
      "Select Search and choose ALP on SIX Swiss Exchange to inspect partial history. Choose 1M for an empty range or 5Y for usable prices.",
  },
} satisfies ControllerStory;

export const partialPriceHistoryDarkView = {
  ...partialPriceHistoryView,
  parameters: {
    ...partialPriceHistoryView.parameters,
    colorScheme: "dark",
    manualSetup:
      "Select Search and choose ALP on SIX Swiss Exchange to inspect partial history in the pinned dark theme. Switch between 1M and 5Y.",
  },
} satisfies ControllerStory;

export const partialPriceHistoryMobileView = {
  ...partialPriceHistoryView,
  globals: { viewport: { value: "cashfolioMobile" } },
  parameters: {
    manualSetup:
      "Select Search and choose ALP on SIX Swiss Exchange to inspect partial history on mobile. Switch between 1M and 5Y; Back to Results returns to the grid.",
  },
} satisfies ControllerStory;

export const unusablePriceHistoryView = {
  args: { scenario: "unusable" },
  parameters: {
    manualSetup:
      "Select Search and choose ALP on SIX Swiss Exchange to inspect unusable history and the disabled retry cooldown.",
  },
} satisfies ControllerStory;

export const historyRetryCooldownView = {
  args: { scenario: "cooldown" },
  parameters: {
    docs: {
      description: {
        story:
          "The fixture compresses the server cooldown to two seconds to exercise expiry; production uses five minutes. Expiry enables Retry without making a request.",
      },
    },
    manualSetup:
      "Select Search and choose ALP on SIX Swiss Exchange. Wait two seconds for Retry Price History to become enabled, then select it to recover.",
  },
} satisfies ControllerStory;

export const informationalColumnsView = {
  args: { initialSearch: "ready" },
  parameters: {
    manualSetup:
      "Select a row to open details, then change pages or close details. Focus a cell and press Space for keyboard selection. Column headers have no sorting or filtering.",
  },
} satisfies SearchStory;

export const newSearchResetsGridView = {
  args: { initialSearch: "ready", initialSelectedId: "ALP:XNAS" },
  parameters: {
    manualSetup:
      "Go to the next page, then enter Harbor and press Enter. Submitting Search resets the page and selection; editing alone leaves the results intact.",
  },
} satisfies SearchStory;

export const mobileBrowsingStateView = {
  ...informationalColumnsView,
  globals: { viewport: { value: "cashfolioMobile" } },
  parameters: {
    manualSetup:
      "Enter a draft without submitting it, go to the next page, and select a listing. Select Back to Results to inspect the retained draft, page, selection, and focus.",
  },
} satisfies SearchStory;

export const metadataFailureKeepsHistoryView = {
  args: { scenario: "metadataError" },
  parameters: {
    manualSetup:
      "Select Search and choose ALP on NASDAQ to inspect usable price history with unknown ISIN after a metadata failure.",
  },
} satisfies ControllerStory;

export const metadataBeforeHistoryView = {
  args: { scenario: "metadataFirst" },
  parameters: {
    manualSetup:
      "Select Search and choose ALP on NASDAQ. Inspect the ISIN while history is loading, then select Release Previous Response.",
  },
} satisfies ControllerStory;

export const historyBeforeMetadataView = {
  args: { scenario: "metadataLate" },
  parameters: {
    manualSetup:
      "Select Search and choose ALP on NASDAQ. Inspect the price while ISIN is loading, then select Release Previous Response. To try cancellation, close details, submit a new search, or select ALP on SIX before releasing.",
  },
} satisfies ControllerStory;

export const isinOnMobileView = {
  ...historyBeforeMetadataView,
  globals: { viewport: { value: "cashfolioMobile" } },
  parameters: {
    manualSetup:
      "Select Search and choose ALP on NASDAQ. Inspect the price while ISIN is loading, then select Release Previous Response; Back to Results returns to the grid.",
  },
} satisfies ControllerStory;

export const restorePageAndSelectionView = {
  args: {
    initialView: {
      q: "",
      page: 2,
      selectedSymbol: "ALP",
      selectedMic: "XSWX",
      range: "5Y",
    },
  },
  parameters: {
    manualSetup:
      "Inspect the restored second page and selected ALP on SIX Swiss Exchange at 5Y, then choose Previous Page. Fixture Back/Forward restores committed views.",
  },
} satisfies ControllerStory;

export const unavailableRestoredSelectionView = {
  args: {
    initialView: {
      q: "Alpine",
      selectedSymbol: "MISSING",
      selectedMic: "XNAS",
    },
    scenario: "missingSelection",
  },
  parameters: {
    manualSetup:
      "Select Back to Results to dismiss the unavailable restored selection, then choose a listing to open its details.",
  },
} satisfies ControllerStory;

export const switchClearsDerivedValuesView = {
  args: { scenario: "switchPending" },
  parameters: {
    manualSetup:
      "Select Search, then ALP on NASDAQ and ALP on SIX Swiss Exchange. Inspect cleared metadata and loading history, then select Release Previous Response.",
  },
} satisfies ControllerStory;

export const unavailableRestoredPageView = {
  args: { initialView: { q: "Alpine", page: 2 } },
  parameters: {
    manualSetup:
      "Select First Page to recover from the unavailable restored second page.",
  },
} satisfies ControllerStory;

export const pendingPageKeepsSelectionView = {
  args: { scenario: "pagePending" },
  parameters: {
    manualSetup:
      "Select Search, choose ALP on NASDAQ, then Next Page. Inspect pending rows and retained details, then select Release Previous Response.",
  },
} satisfies ControllerStory;

export const pendingCountsDarkView = {
  ...obsoleteSearchResponseView,
  parameters: {
    colorScheme: "dark",
    manualSetup:
      "Select Search to inspect pending counts and skeleton rows in the pinned dark theme, then select Release Previous Response.",
  },
} satisfies ControllerStory;

export const failedPageRetryKeepsSelectionView = {
  args: { scenario: "pageError" },
  parameters: {
    manualSetup:
      "Select Search, choose ALP on NASDAQ, then Next Page. Select Release Previous Response to show the page failure, Retry Results to retry, and Release Previous Response to finish.",
  },
} satisfies ControllerStory;

export const preferenceHydrationView = {
  args: { scenario: "preferencePending", savedExchange: "XSWX" },
  parameters: {
    manualSetup:
      "Type a Security draft while the exchange preference is loading. Select Release Previous Response to restore SIX Swiss Exchange, then Clear Exchange to save All Exchanges.",
  },
} satisfies ControllerStory;

export const rapidPreferenceSavesView = {
  args: { scenario: "preferenceRapid" },
  parameters: {
    manualSetup:
      "Choose Swiss, then NASDAQ, then Clear Exchange. Select Release Previous Response to finish the first save and persist the latest choice.",
  },
} satisfies ControllerStory;

export const preferenceSaveRetryView = {
  args: { scenario: "preferenceSaveError" },
  parameters: {
    manualSetup:
      "Choose Swiss to show a preference-save failure. Search still works; select Retry Saving Preference to recover.",
  },
} satisfies ControllerStory;

export const preferenceReadRetryView = {
  args: { scenario: "preferenceLoadError", savedExchange: "XSWX" },
  parameters: {
    manualSetup:
      "Select Retry Preference to recover the saved SIX Swiss Exchange choice without starting a search.",
  },
} satisfies ControllerStory;

export const searchAndFilterView = {
  parameters: {
    manualSetup:
      "Select Search to browse all fixtures, or enter a name/symbol, optionally choose an exchange, and press Enter. Select a row, change pages, or submit another search to explore selection and reset behavior.",
  },
} satisfies SearchStory;

export const chartAndCopyView = {
  args: {
    initialSearch: "ready",
    initialSelectedId: "ALP:XNAS",
    copySymbol: fn().mockResolvedValue(undefined),
  },
  parameters: {
    manualSetup:
      "Choose a chart range, then select Copy Symbol to see simulated clipboard feedback.",
  },
} satisfies SearchStory;

export const keyboardSelectionView = {
  args: { initialSearch: "ready", initialQuery: "ALP" },
  parameters: {
    manualSetup: "Focus a result cell and press Space to open its details.",
  },
} satisfies SearchStory;

export const searchErrorView = {
  args: { initialSearch: "error", initialQuery: "Alpine" },
  parameters: {
    manualSetup:
      "Select Retry Search to recover locally from the supplied search error.",
  },
} satisfies SearchStory;

export const chartErrorView = {
  args: {
    initialSearch: "ready",
    initialSelectedId: "ALP:XNAS",
    initialHistory: "error",
  },
  parameters: {
    manualSetup:
      "Select Retry Price History to recover locally from the supplied chart error.",
  },
} satisfies SearchStory;

export const copyFailureView = {
  args: {
    initialSearch: "ready",
    initialSelectedId: "ALP:XNAS",
    copySymbol: async () => {
      throw new Error("Clipboard unavailable");
    },
  },
  parameters: {
    manualSetup:
      "Select Copy Symbol to show the simulated clipboard failure; select it again to retry.",
  },
} satisfies SearchStory;
