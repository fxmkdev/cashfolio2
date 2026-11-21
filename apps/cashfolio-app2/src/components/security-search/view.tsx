import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
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
  const grid = useRef<SecurityResultsGridHandle>(null);
  const previousSelection = useRef<string | null>(null);
  const selectedId =
    search.status === "ready" ? (selectedListing?.id ?? null) : null;
  useEffect(() => {
    if (previousSelection.current && !selectedId) {
      grid.current?.focusListing(previousSelection.current);
    }
    previousSelection.current = selectedId;
  }, [selectedId]);
  const exchangeLabel =
    search.status !== "idle" && search.criteria.exchange
      ? props.exchanges.find((item) => item.value === search.criteria.exchange)
          ?.label
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
        data-details-open={selectedId ? true : undefined}
      >
        <div className={classes.resultsPane}>
          <Paper withBorder p="md">
            <form
              className={classes.searchForm}
              onSubmit={(event) => {
                event.preventDefault();
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
              <Select
                label="Exchange"
                placeholder="All Exchanges"
                searchable
                clearable
                data={props.exchanges}
                value={exchange}
                onChange={setExchange}
                onDropdownOpen={props.onLoadExchanges}
                rightSection={
                  props.exchangeStatus === "loading" ? (
                    <Loader size="xs" />
                  ) : undefined
                }
              />
              <Button type="submit" loading={search.status === "loading"}>
                Search
              </Button>
            </form>
          </Paper>
          {props.exchangeStatus === "error" && (
            <Alert color="red" title="Exchanges Unavailable" role="alert">
              <Text size="sm">
                Exchanges could not be loaded. You can still search all
                exchanges.
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
            <Group role="status" mih={180} justify="center">
              <Loader size="sm" />
              <Text>Searching securities…</Text>
            </Group>
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
        {search.status === "ready" && selectedListing && (
          <SecurityDetails
            key={selectedListing.id}
            listing={selectedListing}
            history={props.history}
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
