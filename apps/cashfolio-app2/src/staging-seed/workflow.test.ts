import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  jsonReader,
  resolveSeedBranch,
  resolveSeedTarget,
  seedDeployedApp,
} from "../../scripts/manual-seed-workflow";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const repo = "owner/cashfolio2";
const pr = {
  number: 42,
  head: { ref: "codex/demo", repo: { full_name: repo, fork: false } },
};
const branch = {
  id: "br-preview",
  name: "pr-42-demo-cashfolio-app2",
  project_id: "test-project",
  parent_id: "br-staging",
};

describe("branch selection", () => {
  it("routes main to staging without looking for a PR", async () => {
    const read = vi.fn();
    await expect(
      resolveSeedTarget("refs/heads/main", repo, read),
    ).resolves.toEqual({ environment: "staging", prNumber: "" });
    expect(read).not.toHaveBeenCalled();
  });

  it("resolves a same-repository open PR and encodes the full branch name", async () => {
    const read = vi.fn().mockResolvedValue([pr]);
    await expect(
      resolveSeedTarget("refs/heads/codex/demo", repo, read),
    ).resolves.toEqual({ environment: "preview", prNumber: "42" });
    const query = new URL(`https://api.github.com${read.mock.calls[0][0]}`)
      .searchParams;
    expect(query.get("state")).toBe("open");
    expect(query.get("head")).toBe("owner:codex/demo");
  });

  it.each(["refs/tags/v1", "refs/pull/42/merge", "main"])(
    "rejects non-branch ref %s",
    async (ref) => {
      const read = vi.fn();
      await expect(resolveSeedTarget(ref, repo, read)).rejects.toThrow(
        "Select a branch",
      );
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each([
    [],
    [pr, pr],
    [{ ...pr, head: { ...pr.head, ref: "other" } }],
    [{ ...pr, head: { ...pr.head, repo: null } }],
    [
      {
        ...pr,
        head: {
          ...pr.head,
          repo: { full_name: "fork/cashfolio2", fork: true },
        },
      },
    ],
    [{ ...pr, head: { ...pr.head, repo: { full_name: repo, fork: true } } }],
  ])("rejects missing, ambiguous or fork PRs (%j)", async (...prs) => {
    await expect(
      resolveSeedTarget(
        "refs/heads/codex/demo",
        repo,
        vi.fn().mockResolvedValue(prs),
      ),
    ).rejects.toThrow("exactly one");
  });

  it("searches later pages and rejects malformed responses", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, () => ({
          ...pr,
          head: { ...pr.head, ref: "other" },
        })),
      )
      .mockResolvedValueOnce([pr]);
    await expect(
      resolveSeedTarget("refs/heads/codex/demo", repo, read),
    ).resolves.toMatchObject({ prNumber: "42" });
    expect(read.mock.calls[1][0]).toContain("page=2");
    await expect(
      resolveSeedTarget(
        "refs/heads/codex/demo",
        repo,
        vi.fn().mockResolvedValue({}),
      ),
    ).rejects.toThrow("Could not list");
  });
});

describe("existing Neon branch lookup", () => {
  it("verifies the configured staging branch by ID", async () => {
    const read = vi
      .fn()
      .mockResolvedValue({ branch: { ...branch, id: "br-staging" } });
    await expect(
      resolveSeedBranch("test-project", "br-staging", undefined, read),
    ).resolves.toBe("br-staging");
    expect(read).toHaveBeenCalledExactlyOnceWith(
      "/projects/test-project/branches/br-staging",
    );
  });

  it("matches the exact preview name across paginated search results", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        branches: [{ ...branch, name: `${branch.name}-other` }],
        pagination: { next: "next-page" },
      })
      .mockResolvedValueOnce({ branches: [branch] });
    await expect(
      resolveSeedBranch("test-project", "br-staging", branch.name, read),
    ).resolves.toBe("br-preview");
    expect(read.mock.calls[1][0]).toContain("cursor=next-page");
    expect(
      read.mock.calls.every(([path]) =>
        path.startsWith("/projects/test-project/branches?"),
      ),
    ).toBe(true);
  });

  it.each([
    [],
    [branch, branch],
    [{ ...branch, id: "br-staging" }],
    [{ ...branch, id: "invalid" }],
    [{ ...branch, project_id: "foreign-project" }],
    [{ ...branch, parent_id: "br-production" }],
  ])(
    "rejects absent or unexpected preview resources (%j)",
    async (...branches) => {
      await expect(
        resolveSeedBranch(
          "test-project",
          "br-staging",
          branch.name,
          vi.fn().mockResolvedValue({ branches }),
        ),
      ).rejects.toThrow("existing preview Neon branch");
    },
  );

  it("rejects invalid configuration before any provider request", async () => {
    const read = vi.fn();
    await expect(
      resolveSeedBranch("", "br-staging", branch.name, read),
    ).rejects.toThrow("IDs are required");
    await expect(
      resolveSeedBranch("test-project", "staging", branch.name, read),
    ).rejects.toThrow("IDs are required");
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects mismatched staging and malformed preview responses", async () => {
    for (const result of [
      {},
      { branch },
      { branch: { ...branch, id: "br-staging", project_id: "other" } },
    ]) {
      await expect(
        resolveSeedBranch(
          "test-project",
          "br-staging",
          undefined,
          vi.fn().mockResolvedValue(result),
        ),
      ).rejects.toThrow("verify the existing staging branch");
    }
    await expect(
      resolveSeedBranch(
        "test-project",
        "br-staging",
        branch.name,
        vi.fn().mockResolvedValue({}),
      ),
    ).rejects.toThrow("list existing Neon branches");
  });
});

describe("read-only API requests", () => {
  it("uses GET and never exposes response bodies on HTTP failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ branches: [] })))
      .mockResolvedValueOnce(new Response("secret response", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const read = jsonReader("https://console.neon.tech/api/v2", "secret");
    await expect(read("/projects/test-project/branches")).resolves.toEqual({
      branches: [],
    });
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("method");
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("body");
    await expect(read("/projects/test-project/branches")).rejects.toThrow(
      "Read-only API request failed (HTTP 403).",
    );
  });
});

describe("deployed seed invocation", () => {
  const input = {
    projectId: "test-project",
    branchId: "br-preview",
    testerExternalIds: ["tester"],
  };
  function childProcess() {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
    });
    vi.mocked(spawn).mockReturnValue(
      child as unknown as ReturnType<typeof spawn>,
    );
    return child;
  }

  it("uses the deployed CLI and stdin without passing database credentials", async () => {
    const child = childProcess();
    const end = vi.spyOn(child.stdin, "end");
    const result = seedDeployedApp("preview-app", input);
    child.emit("close", 0);
    await expect(result).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledWith(
      "flyctl",
      [
        "ssh",
        "console",
        "--app",
        "preview-app",
        "--process-group",
        "app",
        "--command",
        "node /app/apps/cashfolio-app2/dist/staging-seed/seed.mjs --manual",
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    expect(end).toHaveBeenCalledExactlyOnceWith(JSON.stringify(input));
  });

  it.each([1, 255, null])(
    "fails CI for unsuccessful SSH exit %j",
    async (code) => {
      const child = childProcess();
      const result = seedDeployedApp("preview-app", input);
      child.emit("close", code);
      await expect(result).rejects.toThrow("deployed seed command failed");
      expect(spawn).toHaveBeenCalledOnce();
    },
  );

  it("rejects SSH launch and stdin failures", async () => {
    for (const source of ["process", "stdin"]) {
      const child = childProcess();
      const result = seedDeployedApp("preview-app", input);
      const error = new Error("sensitive transport error");
      if (source === "process") child.emit("error", error);
      else child.stdin.emit("error", error);
      await expect(result).rejects.toThrow(
        source === "process"
          ? "Could not start Fly SSH"
          : "Could not send manual seed input",
      );
    }
  });

  it("rejects a missing or invalid app before starting SSH", () => {
    expect(() => seedDeployedApp("", input)).toThrow("valid Fly app");
    expect(() => seedDeployedApp("app;echo", input)).toThrow("valid Fly app");
    expect(spawn).not.toHaveBeenCalled();
  });
});
