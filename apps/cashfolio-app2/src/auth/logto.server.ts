import {
  type GetContextParameters,
  type LogtoConfig,
  type LogtoContext,
} from "@logto/node";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { ensureSameOriginRequest } from "../security/same-origin.server";
import {
  authenticateSessionClient,
  createSessionClient,
  hasUnexpiredClaims,
  isInvalidSessionCredential,
  LogtoSessionStorage,
} from "./logto-session-client.server";
import {
  createSession,
  readSessionData,
  revokeSession,
  saveSession,
  withSessionLock,
} from "./session-store.server";
import {
  hashSessionToken,
  isSessionCurrent,
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
} from "./session-policy";

export type SessionAccessOptions = { allowDeletionPending?: boolean };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

function getLogtoConfig(): LogtoConfig {
  return {
    endpoint: requireEnv("LOGTO_ENDPOINT"),
    appId: requireEnv("LOGTO_APP_ID"),
    appSecret: requireEnv("LOGTO_APP_SECRET"),
    scopes: ["email", "profile"],
  };
}

const cookieOptions = {
  secure: true,
  httpOnly: true,
  sameSite: "lax",
  path: "/",
} as const;

function clearCookie() {
  setCookie(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

function writeCookie(session: { token: string; expiresAt: Date }) {
  setCookie(SESSION_COOKIE, session.token, {
    ...cookieOptions,
    maxAge: Math.max(
      0,
      Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
    ),
  });
  setCookie(LEGACY_SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

async function withAuthenticatedClient<T>(
  operation: (
    client: ReturnType<typeof createSessionClient>,
    context: LogtoContext,
  ) => Promise<T>,
  options: SessionAccessOptions = {},
): Promise<T | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!hashSessionToken(token)) {
    if (token) clearCookie();
    return null;
  }
  const result = await withSessionLock(token, async (tx, session) => {
    if (!session) return { value: null, clear: true };
    if (!session.user) return { value: null, clear: false };
    if (session.user.deletionPending && !options.allowDeletionPending) {
      return { value: null, clear: false };
    }
    const storage = new LogtoSessionStorage(await readSessionData(session));
    try {
      // A pending deletion's server session authorizes only deletion retries.
      // Its Logto identity may already be gone after partial cleanup.
      const authenticated =
        session.user.deletionPending && options.allowDeletionPending
          ? await (async () => {
              const client = createSessionClient(getLogtoConfig(), storage);
              return {
                client,
                context: await client.getContext({ getAccessToken: false }),
              };
            })()
          : await authenticateSessionClient(getLogtoConfig(), storage);
      const { client, context } = authenticated;
      if (
        !context.isAuthenticated ||
        context.claims?.sub !== session.user.externalId
      ) {
        await revokeSession(tx, session);
        return { value: null, clear: true };
      }
      const value = await operation(client, context);
      if (
        !(await saveSession(
          tx,
          session,
          storage.data,
          options.allowDeletionPending,
        ))
      ) {
        return { value: null, clear: false };
      }
      return { value, clear: false };
    } catch (error) {
      if (!isInvalidSessionCredential(error)) {
        throw new Response(
          "Authentication is temporarily unavailable. Please try again.",
          { status: 503 },
        );
      }
      await revokeSession(tx, session);
      return { value: null, clear: true };
    }
  });
  if (result.clear) clearCookie();
  return result.value;
}

export async function getLogtoContext(
  _parameters: GetContextParameters = { getAccessToken: false },
  options?: SessionAccessOptions,
): Promise<LogtoContext> {
  return (
    (await withAuthenticatedClient(
      async (_client, context) => context,
      options,
    )) ?? { isAuthenticated: false }
  );
}

export function getLogtoAccountSecurityUrl() {
  return new URL("/account/security", requireEnv("LOGTO_ENDPOINT")).toString();
}

export async function fetchLogtoAccountApi(
  pathname: string,
  init?: RequestInit,
) {
  const response = await withAuthenticatedClient(async (client) => {
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${await client.getAccessToken()}`);
    return fetch(new URL(pathname, requireEnv("LOGTO_ENDPOINT")), {
      ...init,
      headers,
      signal: AbortSignal.timeout(5_000),
    });
  });
  if (!response) throw new Response("Unauthorized", { status: 401 });
  return response;
}

async function startSignIn(signUp: boolean) {
  let navigateToUrl = "/";
  const storage = new LogtoSessionStorage();
  const client = createSessionClient(getLogtoConfig(), storage, (url) => {
    navigateToUrl = url;
  });
  const session = await withSessionLock(
    getCookie(SESSION_COOKIE),
    async (tx, current) => {
      // Preserve deletion-only credentials when an ordinary route sends a
      // user with incomplete deletion back through sign-in.
      if (current?.user?.deletionPending) return null;
      await client.signIn({
        redirectUri: new URL(
          "/api/logto/callback",
          requireEnv("BASE_URL"),
        ).toString(),
        ...(signUp ? { interactionMode: "signUp" as const } : {}),
      });
      await revokeSession(tx, current);
      return createSession(tx, storage.data, null);
    },
  );
  if (!session)
    return new Response(null, {
      status: 302,
      headers: { Location: "/user/delete" },
    });
  writeCookie(session);
  return new Response(null, {
    status: 302,
    headers: { Location: navigateToUrl },
  });
}

export const handleLogtoSignIn = () => startSignIn(false);
export const handleLogtoSignUp = () => startSignIn(true);

export async function handleLogtoSignInCallback(request: Request) {
  const token = getCookie(SESSION_COOKIE);
  if (!hashSessionToken(token))
    throw new Response("Sign-in session expired. Please sign in again.", {
      status: 400,
    });
  const result = await withSessionLock(token, async (tx, pending) => {
    if (!pending || pending.userId) return null;
    const storage = new LogtoSessionStorage(await readSessionData(pending));
    const client = createSessionClient(getLogtoConfig(), storage);
    const url = new URL(request.url);
    const callbackUri = new URL(
      `${url.pathname}${url.search}`,
      requireEnv("BASE_URL"),
    ).toString();
    try {
      await client.handleSignInCallback(callbackUri);
    } catch {
      await revokeSession(tx, pending);
      return null;
    }
    const context = await client.getContext({ getAccessToken: false });
    if (
      !isSessionCurrent(pending) ||
      !context.isAuthenticated ||
      !context.claims ||
      !hasUnexpiredClaims(context.claims)
    ) {
      await revokeSession(tx, pending);
      return null;
    }
    await tx.user.upsert({
      where: { externalId: context.claims.sub },
      create: { externalId: context.claims.sub },
      update: {},
    });
    await tx.$queryRaw`SELECT id FROM "User" WHERE "externalId" = ${context.claims.sub} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { externalId: context.claims.sub },
    });
    await revokeSession(tx, pending);
    if (user.deletionPending) return null;
    return createSession(tx, storage.data, user.id);
  });
  if (!result) {
    clearCookie();
    throw new Response(
      "Sign-in session expired or invalid. Please sign in again.",
      { status: 400 },
    );
  }
  writeCookie(result);
  return new Response(null, { status: 302, headers: { Location: "/" } });
}

export async function handleLogtoSignOut(request: Request) {
  const baseUrl = requireEnv("BASE_URL");
  ensureSameOriginRequest(request, { baseUrl });
  const data = await withSessionLock(
    getCookie(SESSION_COOKIE),
    async (tx, session) => {
      const data = session ? await readSessionData(session) : {};
      await revokeSession(tx, session);
      return data;
    },
  );
  // Commit revocation before fallible provider operations or cookie clearing.
  clearCookie();
  let navigateToUrl = "/";
  try {
    const client = createSessionClient(
      getLogtoConfig(),
      new LogtoSessionStorage(data),
      (url) => {
        navigateToUrl = url;
      },
    );
    await client.signOut(new URL("/", baseUrl).toString());
  } catch {
    navigateToUrl = "/";
  }
  return new Response(null, {
    status: 302,
    headers: { Location: navigateToUrl },
  });
}

export async function destroyLogtoSession() {
  await withSessionLock(getCookie(SESSION_COOKIE), async (tx, session) =>
    revokeSession(tx, session),
  );
  clearCookie();
}
