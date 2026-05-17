import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_USER_LOCALE, type UserLocale } from "./user-locale";

const UserLocaleContext = createContext<UserLocale>(DEFAULT_USER_LOCALE);

export function UserLocaleProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: UserLocale;
}) {
  return (
    <UserLocaleContext.Provider value={locale}>
      {children}
    </UserLocaleContext.Provider>
  );
}

export function useUserLocale(): UserLocale {
  return useContext(UserLocaleContext);
}
