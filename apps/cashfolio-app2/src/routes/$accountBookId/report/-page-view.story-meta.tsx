import type { Meta } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DEFAULT_PERIOD_VALUE } from "@/shared/reporting/period";
import { ReportPageView } from "./-page-view";
import {
  STORYBOOK_ACCOUNT_BOOK_ID,
  baseOverview,
  clearReportStorySessionStorage,
} from "./-page-view.story-fixtures";

export const reportPageStoryMeta = {
  parameters: { layout: "fullscreen", controls: { disable: true } },
  component: ReportPageView,
  decorators: [
    (Story, context) => {
      clearReportStorySessionStorage(
        context.args.accountBookId ?? STORYBOOK_ACCOUNT_BOOK_ID,
      );

      return <Story />;
    },
  ],
  args: {
    accountBookId: STORYBOOK_ACCOUNT_BOOK_ID,
    overview: baseOverview,
    selectedPeriodValue: DEFAULT_PERIOD_VALUE,
    onPeriodChange: fn(),
    onBreakdownAccountDoubleClick: fn(),
    onGainLossUnitAccountDoubleClick: fn(),
  },
} satisfies Meta<typeof ReportPageView>;
