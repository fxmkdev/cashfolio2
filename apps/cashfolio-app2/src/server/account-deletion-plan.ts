export type AccountDeletionPreview = {
  displayName: string;
  accountBooksToDelete: AccountDeletionAccountBook[];
  accountBooksToUnlink: AccountDeletionAccountBook[];
};

export type AccountDeletionAccountBook = {
  id: string;
  name: string;
};

export type LinkedAccountBook = {
  accountBook: {
    id: string;
    name: string;
    _count: {
      userLinks: number;
    };
  };
};

export type DeletionPlan = {
  accountBooksToDelete: AccountDeletionAccountBook[];
  accountBooksToUnlink: AccountDeletionAccountBook[];
};

export function planAccountDeletionFromLinks(
  links: LinkedAccountBook[],
): DeletionPlan {
  const accountBooksToDelete: AccountDeletionAccountBook[] = [];
  const accountBooksToUnlink: AccountDeletionAccountBook[] = [];

  for (const link of links) {
    const accountBook = {
      id: link.accountBook.id,
      name: link.accountBook.name,
    };

    if (link.accountBook._count.userLinks <= 1) {
      accountBooksToDelete.push(accountBook);
    } else {
      accountBooksToUnlink.push(accountBook);
    }
  }

  return { accountBooksToDelete, accountBooksToUnlink };
}
