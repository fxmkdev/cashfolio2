const REDACTED = "[redacted]";
const MAX_DEPTH = 4;
const MAX_BODY_TEXT_LENGTH = 4_000;

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

  try {
    const bodyText = await response.clone().text();
    return truncateText(redactSensitiveText(bodyText));
  } catch (error) {
    return {
      error: await serializeUnknown(error, {
        depth: 0,
        seen: new WeakSet<object>(),
      }),
    };
  }
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

function truncateText(text: string) {
  if (text.length <= MAX_BODY_TEXT_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_BODY_TEXT_LENGTH)}... [truncated]`;
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

function fallbackString(value: unknown) {
  try {
    return String(value);
  } catch {
    return "[unstringifiable]";
  }
}
