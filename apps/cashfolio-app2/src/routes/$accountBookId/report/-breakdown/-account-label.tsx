import { Stack, Text } from "@mantine/core";
import classes from "./-account-label.module.css";

export function getReportNodeLabel(node: {
  label: string;
  accountGroupPath?: string[];
}): string {
  return [...(node.accountGroupPath ?? []), node.label].join(" / ");
}

type ReportNameRow = { name: string; accountGroupPath?: string[] };

export function getReportRowLabel(data: ReportNameRow | undefined) {
  return data ? getReportNodeLabel({ ...data, label: data.name }) : undefined;
}

export function ReportNameCell({ data }: { data?: ReportNameRow }) {
  if (!data?.accountGroupPath?.length) return data?.name ?? null;
  return (
    <Stack gap={2} py={4} className={classes.nameCell}>
      <Text size="sm" lh={1.4}>
        {data.name}
      </Text>
      <Text size="xs" c="dimmed" lh={1.4}>
        {data.accountGroupPath.join(" / ")}
      </Text>
    </Stack>
  );
}
