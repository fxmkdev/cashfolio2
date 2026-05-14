export type HomeRedirectTarget =
  | {
      to: "/$accountBookId";
      params: { accountBookId: string };
    }
  | {
      to: "/account-books/new";
    };

export function getHomeRedirectTarget(
  accountBookId: string | null,
): HomeRedirectTarget {
  if (accountBookId) {
    return {
      to: "/$accountBookId",
      params: { accountBookId },
    };
  }

  return {
    to: "/account-books/new",
  };
}
