export type UserDeletionPreview = {
  displayName: string;
  accountBooksToDelete: UserDeletionAccountBook[];
  accountBooksToUnlink: UserDeletionAccountBook[];
};

export type UserDeletionAccountBook = {
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
  accountBooksToDelete: UserDeletionAccountBook[];
  accountBooksToUnlink: UserDeletionAccountBook[];
};

export function planUserDeletionFromLinks(
  links: LinkedAccountBook[],
): DeletionPlan {
  const accountBooksToDelete: UserDeletionAccountBook[] = [];
  const accountBooksToUnlink: UserDeletionAccountBook[] = [];

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
