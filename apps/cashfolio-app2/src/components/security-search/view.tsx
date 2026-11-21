import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Skeleton,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useGlobalLoading } from "../navigation/global-loading";
import { TopPageHeader } from "../layout/top-page-header";
import {
  SecurityResultsGrid,
  type SecurityResultsGridHandle,
} from "./results-grid";
import { SecurityDetails } from "./security-details";
import type {
  HistoryState,
  PriceRange,
  SearchState,
  SecurityListing,
  SecuritySearchCriteria,
} from "./types";
import type { SecurityMetadata } from "@/shared/securities/contracts";
import classes from "./security-search.module.css";

export type SecuritySearchViewProps = {
  search: SearchState;
  controlsKey?: string;
  defaultExchange?: string | null;
  preferencePending?: boolean;
  preferenceLoadError?: boolean;
  preferenceSaveError?: boolean;
  onExchangeChange?: (exchange: string | null) => void;
  onRetryPreferenceLoad?: () => void;
  onRetryPreferenceSave?: () => void;
  selectionPending?: boolean;
  selectionError?: string | null;
  onRetrySelection?: () => void;
  metadataPending?: boolean;
  exchangeStatus?: "idle" | "loading" | "ready" | "error";
  onLoadExchanges?: () => void;
  exchanges: { value: string; label: string }[];
  page: number;
  selectedListing: SecurityListing | null;
  history: HistoryState;
  metadata: SecurityMetadata | null;
  range: PriceRange;
  onSearch: (criteria: SecuritySearchCriteria) => void;
  onPageChange: (page: number) => void;
  onSelect: (id: string | null) => void;
  onCloseDetails: () => void;
  onRangeChange: (range: PriceRange) => void;
  onRetrySearch: () => void;
  onRetryHistory: () => void;
  onCopySymbol: (symbol: string) => Promise<void>;
};

export function SecuritySearchView(props: SecuritySearchViewProps) {
  const { search, selectedListing } = props;
  const [query, setQuery] = useState(
    search.status === "idle" ? "" : search.criteria.query,
  );
  const [exchange, setExchange] = useState<string | null>(
    search.status === "idle" ? null : search.criteria.exchange,
  );
  const submittedQuery = search.status === "idle" ? "" : search.criteria.query;
  const initialExchange =
    props.defaultExchange ??
    (search.status === "idle" ? null : search.criteria.exchange);
  useEffect(() => {
    setQuery(submittedQuery);
  }, [submittedQuery, props.controlsKey]);
  useEffect(() => {
    setExchange(initialExchange);
  }, [initialExchange, props.controlsKey]);
  useGlobalLoading(search.status === "loading");
  const grid = useRef<SecurityResultsGridHandle>(null);
  const previousSelection = useRef<string | null>(null);
  const selectedId =
    search.status === "ready" ? (selectedListing?.id ?? null) : null;
  useEffect(() => {
    if (
      previousSelection.current &&
      !selectedId &&
      !props.selectionPending &&
      !props.selectionError
    ) {
      grid.current?.focusListing(previousSelection.current);
    }
    previousSelection.current = selectedId;
  }, [selectedId, props.selectionPending, props.selectionError]);
  const exchangeLabel =
    search.status !== "idle" && search.criteria.exchange
      ? (props.exchanges.find((item) => item.value === search.criteria.exchange)
          ?.label ?? search.criteria.exchange)
      : null;

  return (
    <section className={classes.page} aria-label="Securities">
      <TopPageHeader
        heading={<Title order={1}>Securities</Title>}
        description={
          <Text c="dimmed" size="sm">
            Find a security and explore its exchange listing and price history.
          </Text>
        }
      />
      <div
        className={classes.workspace}
        data-details-open={
          selectedId || props.selectionPending || props.selectionError
            ? true
            : undefined
        }
      >
        <div className={classes.resultsPane}>
          <Paper withBorder p="md">
            <form
              className={classes.searchForm}
              onSubmit={(event) => {
                event.preventDefault();
                if (!props.preferencePending)
                  props.onSearch({ query: query.trim(), exchange });
              }}
            >
              <TextInput
                label="Security"
                placeholder="Search by name or symbol"
                leftSection={<IconSearch size={16} />}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
              {props.preferencePending ? (
                <Stack gap={6}>
                  <Text size="sm" fw={500}>
                    Exchange
                  </Text>
                  <Skeleton
                    height={36}
                    aria-label="Loading Exchange Preference"
                  />
                </Stack>
              ) : (
                <Select
                  label="Exchange"
                  placeholder="All Exchanges"
                  searchable
                  clearable
                  clearButtonProps={{
                    "aria-label": "Clear Exchange",
                    "aria-hidden": false,
                    tabIndex: 0,
                  }}
                  data={
                    exchange &&
                    !props.exchanges.some((option) => option.value === exchange)
                      ? [
                          ...props.exchanges,
                          { value: exchange, label: exchange },
                        ]
                      : props.exchanges
                  }
                  value={exchange}
                  onChange={(value) => {
                    setExchange(value);
                    props.onExchangeChange?.(value);
                  }}
                  onDropdownOpen={props.onLoadExchanges}
                  rightSection={
                    props.exchangeStatus === "loading" ? (
                      <Skeleton
                        height={12}
                        width={12}
                        aria-label="Loading Exchanges"
                      />
                    ) : undefined
                  }
                />
              )}
              <Button
                disabled={props.preferencePending}
                type="submit"
                loading={search.status === "loading"}
              >
                Search
              </Button>
            </form>
          </Paper>
          {props.preferenceLoadError && (
            <Alert color="red" title="Exchange Preference Unavailable">
              <Text size="sm">
                Your saved exchange could not be loaded. Choose an exchange or
                search all exchanges.
              </Text>
              <Button variant="light" onClick={props.onRetryPreferenceLoad}>
                Retry Preference
              </Button>
            </Alert>
          )}
          {props.preferenceSaveError && (
            <Alert color="red" title="Exchange Preference Not Saved">
              <Text size="sm">
                Your search still works. Retry to save this exchange for your
                next visit.
              </Text>
              <Button variant="light" onClick={props.onRetryPreferenceSave}>
                Retry Saving Preference
              </Button>
            </Alert>
          )}
          {props.exchangeStatus === "error" && (
            <Alert color="red" title="Exchanges Unavailable" role="alert">
              <Text size="sm">
                Exchange names could not be loaded. Your selected exchange is
                preserved; you can still search.
              </Text>
              <Button variant="light" onClick={props.onLoadExchanges}>
                Retry Exchanges
              </Button>
            </Alert>
          )}
          {search.status !== "idle" && (
            <Text size="sm" c="dimmed" aria-label="Submitted Search">
              {search.criteria.query
                ? `Results for “${search.criteria.query}”`
                : "All securities"}
              {exchangeLabel ? ` · ${exchangeLabel}` : " · All exchanges"}
            </Text>
          )}
          {search.status === "idle" ? (
            <Paper withBorder p="xl">
              <Text c="dimmed" ta="center">
                Search by name or symbol, or select Search to browse all
                securities.
              </Text>
            </Paper>
          ) : search.status === "loading" ? (
            <Skeleton height={180} aria-label="Loading Securities" />
          ) : search.status === "error" ? (
            <Alert color="red" title="Search Unavailable" role="alert">
              <Stack gap="sm" align="start">
                <Text size="sm">{search.message}</Text>
                <Button variant="light" onClick={props.onRetrySearch}>
                  Retry Search
                </Button>
              </Stack>
            </Alert>
          ) : (
            <SecurityResultsGrid
              ref={grid}
              key={search.source.key}
              source={search.source}
              page={props.page}
              selectedId={selectedId}
              onPageChange={props.onPageChange}
              onSelect={props.onSelect}
            />
          )}
        </div>
        {(props.selectionPending || props.selectionError) && (
          <Paper
            component="section"
            aria-label="Security Details"
            withBorder
            p="md"
            className={classes.detailsPane}
          >
            <Stack>
              <Button variant="subtle" onClick={props.onCloseDetails}>
                Back to Results
              </Button>
              {props.selectionPending ? (
                <Skeleton height={300} aria-label="Loading Security Details" />
              ) : (
                <Alert color="red" title="Selection Unavailable">
                  <Text size="sm">{props.selectionError}</Text>
                  <Button variant="light" onClick={props.onRetrySelection}>
                    Retry Selection
                  </Button>
                </Alert>
              )}
            </Stack>
          </Paper>
        )}
        {search.status === "ready" && selectedListing && (
          <SecurityDetails
            key={selectedListing.id}
            listing={selectedListing}
            history={props.history}
            metadataPending={props.metadataPending}
            isin={
              props.metadata?.listingId === selectedListing.id
                ? props.metadata.isin
                : null
            }
            range={props.range}
            onClose={props.onCloseDetails}
            onRangeChange={props.onRangeChange}
            onRetryHistory={props.onRetryHistory}
            onCopySymbol={props.onCopySymbol}
          />
        )}
      </div>
    </section>
  );
}
