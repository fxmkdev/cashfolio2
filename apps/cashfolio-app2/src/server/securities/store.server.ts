import type {
  Prisma,
  PrismaClient,
  SecurityCatalogueListing,
} from "../../.prisma-client/client";
import {
  getHistoryLabel,
  type SecuritiesQuery,
  type SecuritiesScope,
  type SecurityListing,
  type TextFilter,
} from "../../shared/securities/contracts";

export function listingResponse(
  row: SecurityCatalogueListing,
): SecurityListing {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    exchange: row.exchange,
    mic: row.mic || null,
    country: row.country,
    hasHistory: row.hasHistory,
    currency: null,
    securityType: null,
  };
}
export async function readSnapshot(db: PrismaClient, version?: string) {
  const now = new Date();
  const snapshot = version
    ? await db.securityCatalogueSnapshot.findFirst({
        where: {
          id: version,
          publishedAt: { not: null },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      })
    : await db.securityCatalogueSnapshot.findFirst({
        where: { publishedAt: { not: null }, expiresAt: null },
        orderBy: { publishedAt: "desc" },
      });
  if (version && !snapshot)
    throw new Error(
      "The securities catalogue was updated. Search again to use the latest catalogue.",
    );
  return snapshot;
}
export function baseWhere(
  scope: SecuritiesScope,
): Prisma.SecurityCatalogueListingWhereInput {
  return {
    snapshotId: scope.version,
    ...(scope.criteria.exchange ? { mic: scope.criteria.exchange } : {}),
    ...(scope.criteria.query
      ? {
          OR: [
            { name: { contains: scope.criteria.query, mode: "insensitive" } },
            { symbol: { contains: scope.criteria.query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}
function textWhere(
  field: "name" | "symbol",
  filter: TextFilter,
): Prisma.SecurityCatalogueListingWhereInput {
  const operation =
    filter.operation === "notContains"
      ? "contains"
      : filter.operation === "notEqual"
        ? "equals"
        : filter.operation;
  const condition = {
    [field]: { [operation]: filter.value, mode: "insensitive" },
  };
  return filter.operation === "notContains" || filter.operation === "notEqual"
    ? { NOT: condition }
    : condition;
}
export function queryWhere(
  query: SecuritiesQuery,
): Prisma.SecurityCatalogueListingWhereInput {
  const clauses: Prisma.SecurityCatalogueListingWhereInput[] = [
    baseWhere(query),
  ];
  for (const key of ["name", "symbol"] as const)
    if (query.filters[key]) clauses.push(textWhere(key, query.filters[key]!));
  if (query.filters.exchange)
    clauses.push({ exchangeLabel: { in: query.filters.exchange } });
  if (query.filters.country)
    clauses.push({
      OR: [
        {
          country: { in: query.filters.country.filter((v) => v !== "Unknown") },
        },
        ...(query.filters.country.includes("Unknown")
          ? [{ country: null }]
          : []),
      ],
    });
  if (query.filters.hasHistory)
    clauses.push({
      OR: query.filters.hasHistory.map((value) => ({
        hasHistory: value === "Unknown" ? null : value === "Available",
      })),
    });
  return { AND: clauses };
}
export async function searchCatalogue(
  db: PrismaClient,
  query: SecuritiesQuery,
) {
  await readSnapshot(db, query.version);
  const orderBy: Prisma.SecurityCatalogueListingOrderByWithRelationInput[] =
    query.sorts.map(({ field, direction }) => ({
      [field === "exchange" ? "exchangeLabel" : field]: direction,
    }));
  orderBy.push({ symbol: "asc" }, { mic: "asc" }, { id: "asc" });
  const [rows, filteredCount, totalCount] = await db.$transaction([
    db.securityCatalogueListing.findMany({
      where: queryWhere(query),
      orderBy,
      skip: query.offset,
      take: query.limit,
    }),
    db.securityCatalogueListing.count({ where: queryWhere(query) }),
    db.securityCatalogueListing.count({ where: baseWhere(query) }),
  ]);
  return {
    version: query.version,
    rows: rows.map(listingResponse),
    filteredCount,
    totalCount,
  };
}
export async function filterOptions(db: PrismaClient, scope: SecuritiesScope) {
  await readSnapshot(db, scope.version);
  const where = baseWhere(scope);
  const [exchanges, countries, flags] = await Promise.all([
    db.securityCatalogueListing.groupBy({
      by: ["exchangeLabel"],
      where,
      orderBy: { exchangeLabel: "asc" },
    }),
    db.securityCatalogueListing.groupBy({
      by: ["country"],
      where,
      orderBy: { country: "asc" },
    }),
    db.securityCatalogueListing.groupBy({ by: ["hasHistory"], where }),
  ]);
  return {
    exchange: exchanges.map((row) => row.exchangeLabel),
    country: countries.map((row) => row.country ?? "Unknown"),
    hasHistory: flags.map((row) => getHistoryLabel(row.hasHistory)),
  };
}
export async function catalogueStatus(db: PrismaClient) {
  const snapshot = await readSnapshot(db);
  if (!snapshot)
    return { version: null, updatedAt: null, stale: false, exchanges: [] };
  const rows = await db.securityCatalogueListing.groupBy({
    by: ["mic", "exchangeLabel"],
    where: { snapshotId: snapshot.id, mic: { not: "" } },
    orderBy: { exchangeLabel: "asc" },
  });
  return {
    version: snapshot.id,
    updatedAt: snapshot.publishedAt!.toISOString(),
    stale: Date.now() - snapshot.publishedAt!.getTime() > 48 * 60 * 60 * 1000,
    exchanges: [
      ...new Map(
        rows.map((row) => [
          row.mic,
          { value: row.mic, label: row.exchangeLabel },
        ]),
      ).values(),
    ],
  };
}
