import { Flex, Loader } from "@mantine/core";

/** Match numeric values without changing cell dimensions or alignment. */
export function GridCellLoading({ label }: { label: string }) {
  return (
    <Flex
      w="100%"
      h="100%"
      justify="flex-end"
      align="center"
      role="status"
      aria-label={label}
    >
      <Loader type="dots" size="xs" aria-hidden="true" />
    </Flex>
  );
}
