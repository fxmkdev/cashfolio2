export type UserDeletionAccountBook = {
  id: string;
  name: string;
};

export type UserDeletionPreview = {
  displayName: string;
  accountBooksToDelete: UserDeletionAccountBook[];
  accountBooksToUnlink: UserDeletionAccountBook[];
};
