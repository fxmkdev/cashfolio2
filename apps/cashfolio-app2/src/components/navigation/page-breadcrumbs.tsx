import { Breadcrumbs, Title } from "@mantine/core";
import type { ComponentType, ReactNode } from "react";
import { LinkAnchor } from "./link-anchor";

const BreadcrumbLink = LinkAnchor as ComponentType<{
  children: ReactNode;
  disabled?: boolean;
  params?: unknown;
  search?: unknown;
  to: string;
}>;

type LinkedPageBreadcrumbItem = {
  label: ReactNode;
  disabled?: boolean;
  params?: unknown;
  search?: unknown;
  to: string;
};

type CurrentPageBreadcrumbItem = {
  label: ReactNode;
  to?: never;
  disabled?: never;
};

export type PageBreadcrumbItem =
  LinkedPageBreadcrumbItem | CurrentPageBreadcrumbItem;

export type PageBreadcrumbsProps = {
  items: readonly PageBreadcrumbItem[];
};

function BreadcrumbLabel({
  children,
  current = false,
  dimmed = false,
}: {
  children: ReactNode;
  current?: boolean;
  dimmed?: boolean;
}) {
  return (
    <Title
      order={2}
      component={current ? "h2" : "span"}
      c={dimmed ? "dimmed" : undefined}
    >
      {children}
    </Title>
  );
}

export function PageBreadcrumbs({ items }: PageBreadcrumbsProps) {
  return (
    <Breadcrumbs
      separator={
        <Title order={2} component="span" c="dimmed">
          /
        </Title>
      }
    >
      {items.map((item, index) => {
        const key = `${index}-${String(item.label)}`;
        const current = index === items.length - 1;

        if (typeof item.to !== "string" || item.disabled) {
          return (
            <BreadcrumbLabel key={key} current={current} dimmed={item.disabled}>
              {item.label}
            </BreadcrumbLabel>
          );
        }

        return (
          <BreadcrumbLink
            key={key}
            to={item.to}
            params={item.params}
            search={item.search}
          >
            <BreadcrumbLabel>{item.label}</BreadcrumbLabel>
          </BreadcrumbLink>
        );
      })}
    </Breadcrumbs>
  );
}
