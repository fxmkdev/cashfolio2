import { useEffect, useState } from "react";
import {
  Button,
  Paper,
  Select,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useGlobalLoading } from "../navigation/global-loading";
import type { SearchState, SecuritySearchCriteria } from "./types";
import classes from "./security-search.module.css";
export type SecuritySearchControlsProps = {
  search: SearchState;
  controlsKey?: string;
  defaultExchange?: string | null;
  preferencePending?: boolean;
  onExchangeChange?: (exchange: string | null) => void;
  exchangeStatus?: "idle" | "loading" | "ready" | "error";
  onLoadExchanges?: () => void;
  exchanges: { value: string; label: string }[];
  onSearch: (criteria: SecuritySearchCriteria) => void;
};
export function SecuritySearchControls(props: SecuritySearchControlsProps) {
  const { search } = props;
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
  return (
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
            <Skeleton height={36} aria-label="Loading Exchange Preference" />
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
                ? [...props.exchanges, { value: exchange, label: exchange }]
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
  );
}
