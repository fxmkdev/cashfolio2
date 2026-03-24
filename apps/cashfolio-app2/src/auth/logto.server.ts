import LogtoClient, {
  CookieStorage,
  type GetContextParameters,
  type LogtoConfig,
} from "@logto/node";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { ensureSameOriginRequest } from "../security/same-origin.server";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

function getRuntimeConfig(): {
  logtoConfig: LogtoConfig;
  baseUrl: string;
  sessionSecret: string;
} {
  return {
    logtoConfig: {
      endpoint: requireEnv("LOGTO_ENDPOINT"),
      appId: requireEnv("LOGTO_APP_ID"),
      appSecret: requireEnv("LOGTO_APP_SECRET"),
      scopes: ["email"],
    },
    baseUrl: requireEnv("BASE_URL"),
    sessionSecret: requireEnv("SESSION_SECRET"),
  };
}

function absoluteUrl(pathname: string, baseUrl: string): string {
  return new URL(pathname, baseUrl).toString();
}

async function createLogtoClient(onNavigate?: (url: string) => void) {
  const { logtoConfig, sessionSecret } = getRuntimeConfig();
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
  ensureSameOriginRequest(request);

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
