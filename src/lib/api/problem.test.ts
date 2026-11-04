import { describe, expect, it, vi } from "vitest";

import { applyFieldErrors, isApiProblem, readProblem } from "./problem";

describe("readProblem", () => {
  it("reads a problem+json body", async () => {
    const res = new Response(
      JSON.stringify({
        type: "validation",
        title: "Bad Request",
        status: 400,
        errors: [{ path: "password", message: "Too short" }],
      }),
      { status: 400, headers: { "content-type": "application/problem+json" } },
    );
    expect(await readProblem(res)).toMatchObject({
      status: 400,
      errors: [{ path: "password", message: "Too short" }],
    });
  });

  it("falls back for a non-problem body", async () => {
    expect(
      await readProblem(new Response("oops", { status: 502, statusText: "Bad Gateway" })),
    ).toEqual({ type: "about:blank", title: "Bad Gateway", status: 502 });
  });

  it("falls back when a problem+json body is not valid JSON", async () => {
    const res = new Response("{", {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "content-type": "application/problem+json" },
    });
    expect(await readProblem(res)).toEqual({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
    });
  });
});

describe("isApiProblem", () => {
  it("accepts a problem and rejects anything else", () => {
    expect(isApiProblem({ type: "x", title: "Bad Request", status: 400 })).toBe(true);
    expect(isApiProblem({ title: "Bad Request" })).toBe(false);
    expect(isApiProblem(null)).toBe(false);
  });
});

describe("applyFieldErrors", () => {
  it("puts known paths on fields and returns the rest", () => {
    const setError = vi.fn();
    const rest = applyFieldErrors(
      {
        type: "x",
        title: "Bad Request",
        status: 400,
        errors: [
          { path: "password", message: "Too short" },
          { path: "token", message: "Invalid" },
        ],
      },
      setError,
      ["password", "name"],
    );
    expect(setError).toHaveBeenCalledWith("password", { type: "server", message: "Too short" });
    expect(rest).toBe("Invalid");
  });

  it("returns the detail when no error has a path", () => {
    const rest = applyFieldErrors(
      { type: "x", title: "Conflict", status: 409, detail: "Already accepted" },
      vi.fn(),
      ["password"],
    );
    expect(rest).toBe("Already accepted");
  });

  it("returns null when every error landed on a field", () => {
    const rest = applyFieldErrors(
      { type: "x", title: "Bad Request", status: 400, errors: [{ path: "name", message: "Required" }] },
      vi.fn(),
      ["name"],
    );
    expect(rest).toBeNull();
  });
});
