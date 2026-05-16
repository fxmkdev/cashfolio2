import { createContext, useContext, useEffect, type ReactNode } from "react";
import { DEFAULT_USER_LOCALE, type UserLocale } from "./user-locale";

const UserLocaleContext = createContext<UserLocale>(DEFAULT_USER_LOCALE);

export function UserLocaleProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: UserLocale;
}) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <UserLocaleContext.Provider value={locale}>
      {children}
    </UserLocaleContext.Provider>
  );
}

export function useUserLocale(): UserLocale {
  return useContext(UserLocaleContext);
}
