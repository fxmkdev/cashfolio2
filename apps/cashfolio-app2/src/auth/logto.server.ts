import LogtoClient, {
  CookieStorage,
  type GetContextParameters,
  type LogtoConfig,
} from "@logto/node";
import { getCookie, setCookie } from "@tanstack/react-start/server";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

const LOGTO_ENDPOINT = requireEnv("LOGTO_ENDPOINT");
const LOGTO_APP_ID = requireEnv("LOGTO_APP_ID");
const LOGTO_APP_SECRET = requireEnv("LOGTO_APP_SECRET");
const BASE_URL = requireEnv("BASE_URL");
const SESSION_SECRET = requireEnv("SESSION_SECRET");

const logtoConfig: LogtoConfig = {
  endpoint: LOGTO_ENDPOINT,
  appId: LOGTO_APP_ID,
  appSecret: LOGTO_APP_SECRET,
  scopes: ["email"],
};

function absoluteUrl(pathname: string): string {
  return new URL(pathname, BASE_URL).toString();
}

async function createLogtoClient(onNavigate?: (url: string) => void) {
  const storage = new CookieStorage({
    encryptionKey: SESSION_SECRET,
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

  const { client } = await createLogtoClient((url) => {
    navigateToUrl = url;
  });

  await client.signIn(absoluteUrl("/api/logto/callback"));

  return new Response(null, {
    status: 302,
    headers: { Location: navigateToUrl },
  });
}

export async function handleLogtoSignUp() {
  let navigateToUrl = "/api/logto/sign-up";

  const { client } = await createLogtoClient((url) => {
    navigateToUrl = url;
  });

  await client.signIn({
    redirectUri: absoluteUrl("/api/logto/callback"),
    interactionMode: "signUp",
  });

  return new Response(null, {
    status: 302,
    headers: { Location: navigateToUrl },
  });
}

export async function handleLogtoSignInCallback(request: Request) {
  const requestUrl = new URL(request.url);
  const callbackUri = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    BASE_URL,
  ).toString();

  const { client } = await createLogtoClient();

  await client.handleSignInCallback(callbackUri);

  return new Response(null, {
    status: 302,
    headers: { Location: "/" },
  });
}

function ensureSameOriginRequest(request: Request) {
  const expectedOrigin = new URL(BASE_URL).origin;
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin) {
    if (requestOrigin !== expectedOrigin) {
      throw new Response("Forbidden", { status: 403 });
    }
    return;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    throw new Response("Forbidden", { status: 403 });
  }

  let refererOrigin = "";
  try {
    refererOrigin = new URL(referer).origin;
  } catch {
    throw new Response("Forbidden", { status: 403 });
  }

  if (refererOrigin !== expectedOrigin) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export async function handleLogtoSignOut(request: Request) {
  ensureSameOriginRequest(request);

  let navigateToUrl = "/";

  const { client, storage } = await createLogtoClient((url) => {
    navigateToUrl = url;
  });

  await client.signOut(absoluteUrl("/"));
  await storage.destroy();

  return new Response(null, {
    status: 302,
    headers: { Location: navigateToUrl },
  });
}
