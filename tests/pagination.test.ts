import { describe, expect, test } from "vitest";
import { paginateCursor } from "../src/lib/pagination.js";

describe("paginateCursor", () => {
  test("fetches pages until limit is reached", async () => {
    const requests: unknown[] = [];
    const result = await paginateCursor(
      { limit: 3, pageSize: 2 },
      async (request) => {
        requests.push(request);
        if (!request.paginationToken) {
          return {
            data: [{ id: "1" }, { id: "2" }],
            meta: { next_token: "next" },
          };
        }
        return {
          data: [{ id: "3" }],
          meta: { next_token: "later" },
        };
      },
    );

    expect(requests).toEqual([
      { maxResults: 2, paginationToken: undefined },
      { maxResults: 1, paginationToken: "next" },
    ]);
    expect(result.data).toEqual([{ id: "1" }, { id: "2" }, { id: "3" }]);
    expect(result.pagination).toEqual({
      limit: 3,
      page_size: 2,
      offset: 0,
      returned: 3,
      next_cursor: "later",
    });
  });

  test("applies offset across page boundaries", async () => {
    const result = await paginateCursor(
      { limit: 2, pageSize: 2, offset: 3 },
      async (request) => {
        if (!request.paginationToken) {
          return {
            data: [{ id: "1" }, { id: "2" }],
            meta: { next_token: "b" },
          };
        }
        if (request.paginationToken === "b") {
          return {
            data: [{ id: "3" }, { id: "4" }],
            meta: { next_token: "c" },
          };
        }
        return {
          data: [{ id: "5" }],
          meta: {},
        };
      },
    );

    expect(result.data).toEqual([{ id: "4" }, { id: "5" }]);
    expect(result.pagination).toEqual({
      limit: 2,
      page_size: 2,
      offset: 3,
      returned: 2,
    });
  });

  test("merges and deduplicates includes by stable keys", async () => {
    const result = await paginateCursor(
      { limit: 2, pageSize: 1 },
      async (request) => {
        if (!request.paginationToken) {
          return {
            data: [{ id: "1" }],
            includes: {
              users: [{ id: "u1", username: "first" }],
              media: [{ media_key: "m1", type: "photo" }],
            },
            meta: { next_token: "next" },
          };
        }
        return {
          data: [{ id: "2" }],
          includes: {
            users: [
              { id: "u1", username: "duplicate" },
              { id: "u2", username: "second" },
            ],
            media: [{ media_key: "m1", type: "photo" }],
          },
          meta: {},
        };
      },
    );

    expect(result.includes).toEqual({
      users: [
        { id: "u1", username: "first" },
        { id: "u2", username: "second" },
      ],
      media: [{ media_key: "m1", type: "photo" }],
    });
  });

  test("returns an empty data array when a page has no data", async () => {
    const result = await paginateCursor(
      { limit: 10, pageSize: 5 },
      async () => ({ meta: { result_count: 0 } }),
    );

    expect(result).toEqual({
      data: [],
      pagination: {
        limit: 10,
        page_size: 5,
        offset: 0,
        returned: 0,
      },
    });
  });
});
