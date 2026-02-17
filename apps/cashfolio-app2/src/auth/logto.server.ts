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
const COOKIE_DOMAIN = requireEnv("COOKIE_DOMAIN");

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
      setCookie(name, value, { ...options, domain: COOKIE_DOMAIN });
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
  const isForwardedHttpsTraffic =
    request.headers.get("x-forwarded-proto") === "https";
  const callbackUri = isForwardedHttpsTraffic
    ? request.url.replace("http://", "https://")
    : request.url;

  const { client } = await createLogtoClient();

  await client.handleSignInCallback(callbackUri);

  return new Response(null, {
    status: 302,
    headers: { Location: "/" },
  });
}

export async function handleLogtoSignOut() {
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
