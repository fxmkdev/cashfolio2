const REDACTED = "[redacted]";
const MAX_DEPTH = 4;
const MAX_BODY_TEXT_LENGTH = 4_000;
const MAX_RESPONSE_BODY_BYTES = MAX_BODY_TEXT_LENGTH * 4;

type SerializableLogValue =
  | string
  | number
  | boolean
  | null
  | SerializableLogValue[]
  | { [key: string]: SerializableLogValue };

const sensitiveKeyPattern =
  /authorization|cookie|credential|password|secret|session|token/i;

const globalErrorLoggingInstalledKey = Symbol.for(
  "cashfolio.serverErrorLoggingInstalled",
);

export async function serializeServerError(
  error: unknown,
): Promise<SerializableLogValue> {
  return serializeUnknown(error, {
    depth: 0,
    seen: new WeakSet<object>(),
  });
}

export async function logServerError(
  message: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  try {
    console.error(message, {
      ...(context ? await serializeContext(context) : {}),
      error: await serializeServerError(error),
    });
  } catch (loggingError) {
    console.error("Failed to serialize server error for logging.", {
      originalError: fallbackString(error),
      loggingError: fallbackString(loggingError),
    });
  }
}

export function shouldLogServerRequestError(error: unknown) {
  if (error instanceof Response) {
    return error.status >= 500;
  }

  if (isRedirectLike(error)) {
    return false;
  }

  const status = getStatusLikeValue(error);
  if (status !== null && status < 500) {
    return false;
  }

  return true;
}

export function installGlobalServerErrorLogging() {
  const globalState = globalThis as unknown as Record<
    symbol,
    boolean | undefined
  >;

  if (globalState[globalErrorLoggingInstalledKey]) {
    return;
  }
  globalState[globalErrorLoggingInstalledKey] = true;

  process.on("unhandledRejection", (reason) => {
    void logServerError("Unhandled promise rejection.", reason).finally(() => {
      process.exit(1);
    });
  });

  process.on("uncaughtException", (error) => {
    void logServerError("Uncaught exception.", error).finally(() => {
      process.exit(1);
    });
  });
}

async function serializeContext(
  context: Record<string, unknown>,
): Promise<Record<string, SerializableLogValue>> {
  const serialized: Record<string, SerializableLogValue> = {};
  for (const [key, value] of Object.entries(context)) {
    serialized[key] = sensitiveKeyPattern.test(key)
      ? REDACTED
      : await serializeUnknown(value, {
          depth: 0,
          seen: new WeakSet<object>(),
        });
  }
  return serialized;
}

async function serializeUnknown(
  value: unknown,
  options: {
    depth: number;
    seen: WeakSet<object>;
  },
): Promise<SerializableLogValue> {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "undefined":
      return { type: "undefined" };
    case "symbol":
    case "function":
      return { type: typeof value, value: String(value) };
  }

  const objectValue = value;

  if (options.depth >= MAX_DEPTH) {
    return { type: getConstructorName(objectValue), value: "[max-depth]" };
  }

  if (options.seen.has(objectValue)) {
    return { type: getConstructorName(objectValue), value: "[circular]" };
  }
  options.seen.add(objectValue);

  if (objectValue instanceof Response) {
    return serializeResponse(objectValue, options);
  }

  if (objectValue instanceof Error) {
    return serializeError(objectValue, options);
  }

  if (objectValue instanceof Date) {
    return { type: "Date", value: objectValue.toISOString() };
  }

  if (Array.isArray(objectValue)) {
    return Promise.all(
      objectValue.map((entry) =>
        serializeUnknown(entry, {
          depth: options.depth + 1,
          seen: options.seen,
        }),
      ),
    );
  }

  return serializePlainObject(objectValue, options);
}

async function serializeResponse(
  response: Response,
  options: {
    depth: number;
    seen: WeakSet<object>;
  },
): Promise<SerializableLogValue> {
  return {
    type: "Response",
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    redirected: response.redirected,
    bodyUsed: response.bodyUsed,
    headers: serializeHeaders(response.headers),
    bodyText: await readResponseBodyText(response),
    ...(await serializeEnumerableFields(response, options)),
  };
}

async function serializeError(
  error: Error,
  options: {
    depth: number;
    seen: WeakSet<object>;
  },
): Promise<SerializableLogValue> {
  return {
    type: getConstructorName(error),
    name: error.name,
    message: error.message,
    stack: error.stack ?? null,
    ...(hasErrorCode(error) ? { code: error.code } : {}),
    ...(error.cause === undefined
      ? {}
      : {
          cause: await serializeUnknown(error.cause, {
            depth: options.depth + 1,
            seen: options.seen,
          }),
        }),
    ...(await serializeEnumerableFields(error, options)),
  };
}

async function serializePlainObject(
  value: object,
  options: {
    depth: number;
    seen: WeakSet<object>;
  },
): Promise<SerializableLogValue> {
  return {
    type: getConstructorName(value),
    ...(await serializeEnumerableFields(value, options)),
  };
}

async function serializeEnumerableFields(
  value: object,
  options: {
    depth: number;
    seen: WeakSet<object>;
  },
) {
  const fields: Record<string, SerializableLogValue> = {};

  for (const [key, entry] of Object.entries(value)) {
    fields[key] = sensitiveKeyPattern.test(key)
      ? REDACTED
      : await serializeUnknown(entry, {
          depth: options.depth + 1,
          seen: options.seen,
        });
  }

  return fields;
}

function serializeHeaders(headers: Headers): SerializableLogValue {
  const serialized: Record<string, SerializableLogValue> = {};
  for (const [key, value] of headers.entries()) {
    serialized[key] = sensitiveKeyPattern.test(key) ? REDACTED : value;
  }
  return serialized;
}

async function readResponseBodyText(response: Response) {
  if (response.body === null) {
    return null;
  }

  if (response.bodyUsed) {
    return "[body-used]";
  }

  try {
    const body = response.clone().body;
    if (body === null) {
      return null;
    }

    return await readBodyPreview(body);
  } catch (error) {
    return {
      error: await serializeUnknown(error, {
        depth: 0,
        seen: new WeakSet<object>(),
      }),
    };
  }
}

async function readBodyPreview(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bodyText = "";
  let bytesRead = 0;
  let truncated = false;

  try {
    while (bodyText.length < MAX_BODY_TEXT_LENGTH) {
      const result = await reader.read();
      if (result.done) {
        bodyText += decoder.decode();
        break;
      }

      bytesRead += result.value.byteLength;
      bodyText += decoder.decode(result.value, { stream: true });

      if (
        bytesRead >= MAX_RESPONSE_BODY_BYTES ||
        bodyText.length >= MAX_BODY_TEXT_LENGTH
      ) {
        truncated = true;
        void reader.cancel();
        break;
      }
    }

    if (!truncated) {
      bodyText += decoder.decode();
    }
  } finally {
    reader.releaseLock();
  }

  const redactedText = redactSensitiveText(
    bodyText.slice(0, MAX_BODY_TEXT_LENGTH),
  );
  return truncated ? `${redactedText}... [truncated]` : redactedText;
}

function redactSensitiveText(text: string) {
  return text
    .replace(
      /("(?:[^"\\]|\\.)*(?:authorization|cookie|credential|password|secret|session|token)(?:[^"\\]|\\.)*"\s*:\s*)("(?:[^"\\]|\\.)*"|[^,}\s]+)/gi,
      `$1"${REDACTED}"`,
    )
    .replace(
      /\b([A-Za-z0-9_-]*(?:authorization|cookie|credential|password|secret|session|token)[A-Za-z0-9_-]*)=([^\s&]+)/gi,
      `$1=${REDACTED}`,
    );
}

function getConstructorName(value: object) {
  return value.constructor?.name ?? "Object";
}

function hasErrorCode(error: Error): error is Error & {
  code: string | number;
} {
  return (
    "code" in error &&
    (typeof (error as { code?: unknown }).code === "string" ||
      typeof (error as { code?: unknown }).code === "number")
  );
}

function isRedirectLike(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "isRedirect" in value &&
    (value as { isRedirect?: unknown }).isRedirect === true
  );
}

function getStatusLikeValue(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const data = value as {
    status?: unknown;
    statusCode?: unknown;
  };
  if (typeof data.status === "number") {
    return data.status;
  }
  if (typeof data.statusCode === "number") {
    return data.statusCode;
  }
  return null;
}

function fallbackString(value: unknown) {
  try {
    return String(value);
  } catch {
    return "[unstringifiable]";
  }
}
