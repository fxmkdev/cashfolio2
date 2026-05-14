export const PENDING_ACCOUNT_BOOK_SWITCH_KEY =
  "cashfolio:pendingAccountBookSwitch";
const PENDING_ACCOUNT_BOOK_SWITCH_TTL_MS = 60_000;

type PendingAccountBookSwitch = {
  accountBookId: string;
  accountBookName: string;
};

type StoredPendingAccountBookSwitch = PendingAccountBookSwitch & {
  createdAt: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getSessionStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function removePendingAccountBookSwitch(storage: StorageLike) {
  try {
    storage.removeItem(PENDING_ACCOUNT_BOOK_SWITCH_KEY);
    return true;
  } catch {
    return false;
  }
}

function readPendingAccountBookSwitch(storage: StorageLike) {
  try {
    return storage.getItem(PENDING_ACCOUNT_BOOK_SWITCH_KEY);
  } catch {
    removePendingAccountBookSwitch(storage);
    return null;
  }
}

function parsePendingAccountBookSwitch(
  value: string | null,
): StoredPendingAccountBookSwitch | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<StoredPendingAccountBookSwitch>;
    if (
      typeof parsed.accountBookId !== "string" ||
      typeof parsed.accountBookName !== "string" ||
      typeof parsed.createdAt !== "number" ||
      !Number.isFinite(parsed.createdAt)
    ) {
      return null;
    }

    return {
      accountBookId: parsed.accountBookId,
      accountBookName: parsed.accountBookName,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export function markPendingAccountBookSwitch(
  accountBookSwitch: PendingAccountBookSwitch,
  storage: StorageLike | null = getSessionStorage(),
  now = Date.now(),
) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      PENDING_ACCOUNT_BOOK_SWITCH_KEY,
      JSON.stringify({
        ...accountBookSwitch,
        createdAt: now,
      }),
    );
  } catch {
    removePendingAccountBookSwitch(storage);
  }
}

export function consumePendingAccountBookSwitch(
  accountBookId: string,
  storage: StorageLike | null = getSessionStorage(),
  now = Date.now(),
) {
  if (!storage) {
    return null;
  }

  const pending = parsePendingAccountBookSwitch(
    readPendingAccountBookSwitch(storage),
  );
  if (!removePendingAccountBookSwitch(storage)) {
    return null;
  }

  if (
    !pending ||
    pending.accountBookId !== accountBookId ||
    now - pending.createdAt > PENDING_ACCOUNT_BOOK_SWITCH_TTL_MS
  ) {
    return null;
  }

  return {
    accountBookId: pending.accountBookId,
    accountBookName: pending.accountBookName,
  };
}
