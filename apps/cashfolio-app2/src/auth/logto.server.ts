import LogtoClient, {
  CookieStorage,
  type GetContextParameters,
  type LogtoConfig,
} from "@logto/node";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { ensureSameOriginRequest } from "../security/same-origin.server";

const DEFAULT_LOGTO_SCOPES = ["email"];
const LOGTO_ACCOUNT_API_SCOPES = ["email", "profile"];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

function getRuntimeConfig({
  scopes = DEFAULT_LOGTO_SCOPES,
}: {
  scopes?: string[];
} = {}): {
  logtoConfig: LogtoConfig;
  baseUrl: string;
  sessionSecret: string;
} {
  return {
    logtoConfig: {
      endpoint: requireEnv("LOGTO_ENDPOINT"),
      appId: requireEnv("LOGTO_APP_ID"),
      appSecret: requireEnv("LOGTO_APP_SECRET"),
      scopes,
    },
    baseUrl: requireEnv("BASE_URL"),
    sessionSecret: requireEnv("SESSION_SECRET"),
  };
}

function absoluteUrl(pathname: string, baseUrl: string): string {
  return new URL(pathname, baseUrl).toString();
}

async function createLogtoClient(
  onNavigate?: (url: string) => void,
  configOptions?: { scopes?: string[] },
) {
  const { logtoConfig, sessionSecret } = getRuntimeConfig(configOptions);
  const storage = new CookieStorage({
    encryptionKey: sessionSecret,
    isSecure: true,
    getCookie: (name) => getCookie(name),
    setCookie: (name, value, options) => {
      setCookie(name, value, options);
    },
  });

  await storage.init();

  const client = new LogtoClient(logtoConfig, {
    storage,
    navigate: async (url) => {
      onNavigate?.(url);
    },
  });

  return { client, storage };
}

export async function getLogtoContext(
  parameters: GetContextParameters = { getAccessToken: false },
) {
  const { client } = await createLogtoClient();
  return client.getContext(parameters);
}

export function getLogtoAccountSecurityUrl() {
  return new URL("/account/security", requireEnv("LOGTO_ENDPOINT")).toString();
}

export async function fetchLogtoAccountApi(
  pathname: string,
  init?: RequestInit,
) {
  const accountApiConfig = { scopes: LOGTO_ACCOUNT_API_SCOPES };
  const { logtoConfig } = getRuntimeConfig(accountApiConfig);
  const { client } = await createLogtoClient(undefined, accountApiConfig);
  const accessToken = await client.getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${accessToken}`);

  return fetch(new URL(pathname, logtoConfig.endpoint), {
    ...init,
    headers,
  });
}

export async function handleLogtoSignIn() {
  let navigateToUrl = "/api/logto/sign-in";
  const { baseUrl } = getRuntimeConfig();

  const { client } = await createLogtoClient((url) => {
    navigateToUrl = url;
  });

  await client.signIn(absoluteUrl("/api/logto/callback", baseUrl));

  return new Response(null, {
    status: 302,
    headers: { Location: navigateToUrl },
  });
}

export async function handleLogtoSignUp() {
  let navigateToUrl = "/api/logto/sign-up";
  const { baseUrl } = getRuntimeConfig();

  const { client } = await createLogtoClient((url) => {
    navigateToUrl = url;
  });

  await client.signIn({
    redirectUri: absoluteUrl("/api/logto/callback", baseUrl),
    interactionMode: "signUp",
  });

  return new Response(null, {
    status: 302,
    headers: { Location: navigateToUrl },
  });
}

export async function handleLogtoSignInCallback(request: Request) {
  const { baseUrl } = getRuntimeConfig();
  const requestUrl = new URL(request.url);
  const callbackUri = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    baseUrl,
  ).toString();

  const { client } = await createLogtoClient();

  await client.handleSignInCallback(callbackUri);

  return new Response(null, {
    status: 302,
    headers: { Location: "/" },
  });
}

export async function handleLogtoSignOut(request: Request) {
  const { baseUrl } = getRuntimeConfig();
  ensureSameOriginRequest(request, { baseUrl });

  let navigateToUrl = "/";

  const { client, storage } = await createLogtoClient((url) => {
    navigateToUrl = url;
  });

  await client.signOut(absoluteUrl("/", baseUrl));
  await storage.destroy();

  return new Response(null, {
    status: 302,
    headers: { Location: navigateToUrl },
  });
}

export async function destroyLogtoSession() {
  const { storage } = await createLogtoClient();
  await storage.destroy();
}
