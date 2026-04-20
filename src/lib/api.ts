import type { Env } from "./env.js";
import { getAccessToken, refreshAccessToken } from "./oauth.js";
import { clampPageSize, type CursorPageRequest } from "./pagination.js";

const API_BASE = "https://api.x.com/2";

const CONTEXT_TWEET_FIELDS =
  "created_at,public_metrics,author_id,conversation_id,entities,lang,note_tweet,referenced_tweets";
const CONTEXT_EXPANSIONS = "author_id,attachments.media_keys,referenced_tweets.id";
const CONTEXT_USER_FIELDS = "name,username,verified,profile_image_url";
const CONTEXT_MEDIA_FIELDS = "url,preview_image_url,type";

function clampRecentSearchMax(maxResults: number): number {
  return Math.max(10, Math.min(maxResults, 100));
}

function getConversationId(
  tweet: Record<string, unknown>,
  fallbackTweetId: string,
): string {
  const data = tweet.data as Record<string, unknown> | undefined;
  return typeof data?.conversation_id === "string"
    ? data.conversation_id
    : fallbackTweetId;
}

function buildConversationContextSearchUrl(
  conversationId: string,
  maxResults: number,
): string {
  const params = new URLSearchParams({
    query: `conversation_id:${conversationId}`,
    max_results: String(clampRecentSearchMax(maxResults)),
    "tweet.fields": CONTEXT_TWEET_FIELDS,
    expansions: CONTEXT_EXPANSIONS,
    "user.fields": CONTEXT_USER_FIELDS,
    "media.fields": CONTEXT_MEDIA_FIELDS,
  });
  return `${API_BASE}/tweets/search/recent?${params}`;
}

function addCursorParams(
  params: URLSearchParams,
  options: CursorPageRequest,
  minPageSize: number,
  maxPageSize: number,
): void {
  params.set(
    "max_results",
    String(clampPageSize(options.maxResults, minPageSize, maxPageSize)),
  );
  if (options.paginationToken) {
    params.set("pagination_token", options.paginationToken);
  }
}

export class XApiClient {
  private env: Env;
  private userId: string | null = null;

  constructor(env: Env) {
    this.env = env;
  }

  // ---- internal ----

  private async request(
    method: string,
    url: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let token = await getAccessToken(this.env);
    let resp = await this.doFetch(method, url, token, body);

    // Auto-refresh on 401
    if (resp.status === 401) {
      const refreshed = await refreshAccessToken(this.env);
      token = refreshed.access_token;
      resp = await this.doFetch(method, url, token, body);
    }

    return this.handle(resp);
  }

  private async doFetch(
    method: string,
    url: string,
    token: string,
    body?: Record<string, unknown>,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(30_000),
    };
    if (body) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return fetch(url, init);
  }

  private async handle(resp: Response): Promise<Record<string, unknown>> {
    if (resp.status === 429) {
      const reset = resp.headers.get("x-rate-limit-reset") ?? "unknown";
      throw new Error(`Rate limited. Resets at ${reset}.`);
    }
    const data = (await resp.json()) as Record<string, unknown>;
    if (!resp.ok) {
      const errors = data.errors as Array<{ detail?: string; message?: string }> | undefined;
      const msg = errors
        ? errors.map((e) => e.detail ?? e.message ?? "").join("; ")
        : JSON.stringify(data).slice(0, 500);
      if (resp.status === 400 && msg.toLowerCase().includes("operator")) {
        throw new Error(
          `API error (HTTP 400): ${msg}\n\n` +
            "Hint: Some search operators (e.g. quoted_tweet_id, context, has:geo) " +
            "require additional X API access. Check the current X search docs and your app plan.",
        );
      }
      throw new Error(`API error (HTTP ${resp.status}): ${msg}`);
    }
    return data;
  }

  async getAuthenticatedUserId(): Promise<string> {
    if (this.userId) return this.userId;
    const data = await this.request("GET", `${API_BASE}/users/me`);
    const inner = data.data as { id: string };
    this.userId = inner.id;
    return this.userId;
  }

  // ---- tweets ----

  async postTweet(
    text: string,
    opts?: {
      replyTo?: string;
      quoteTweetId?: string;
      pollOptions?: string[];
      pollDurationMinutes?: number;
    },
  ) {
    const body: Record<string, unknown> = { text };
    if (opts?.replyTo) {
      body.reply = { in_reply_to_tweet_id: opts.replyTo };
    }
    if (opts?.quoteTweetId) {
      body.quote_tweet_id = opts.quoteTweetId;
    }
    if (opts?.pollOptions) {
      body.poll = {
        options: opts.pollOptions,
        duration_minutes: opts.pollDurationMinutes ?? 1440,
      };
    }
    return this.request("POST", `${API_BASE}/tweets`, body);
  }

  async deleteTweet(tweetId: string) {
    return this.request("DELETE", `${API_BASE}/tweets/${tweetId}`);
  }

  async getTweet(tweetId: string) {
    const params = new URLSearchParams({
      "tweet.fields":
        "created_at,public_metrics,author_id,conversation_id,in_reply_to_user_id,referenced_tweets,attachments,entities,lang,note_tweet",
      expansions: "author_id,referenced_tweets.id,attachments.media_keys",
      "user.fields": "name,username,verified,profile_image_url,public_metrics",
      "media.fields": "url,preview_image_url,type,width,height,alt_text",
    });
    return this.request("GET", `${API_BASE}/tweets/${tweetId}?${params}`);
  }

  async searchTweets(
    query: string,
    options: CursorPageRequest = { maxResults: 10 },
  ) {
    const params = new URLSearchParams({
      query,
      "tweet.fields":
        "created_at,public_metrics,author_id,conversation_id,entities,lang,note_tweet",
      expansions: "author_id,attachments.media_keys",
      "user.fields": "name,username,verified,profile_image_url",
      "media.fields": "url,preview_image_url,type",
    });
    addCursorParams(params, options, 10, 100);
    return this.request("GET", `${API_BASE}/tweets/search/recent?${params}`);
  }

  async getThread(tweetId: string) {
    const tweet = await this.getTweet(tweetId);
    const data = tweet.data as Record<string, unknown>;
    const convId = data.conversation_id as string | undefined;
    const refs = data.referenced_tweets as
      | Array<{ type: string; id: string }>
      | undefined;

    const result: Record<string, unknown> = { target: tweet };

    // Fetch conversation root if this is a reply
    if (convId && convId !== tweetId) {
      result.conversation_root = await this.getTweet(convId);
    }

    // Fetch quoted tweets
    if (refs) {
      const quoted = refs.filter((r) => r.type === "quoted");
      if (quoted.length > 0) {
        result.quoted = await Promise.all(
          quoted.map((r) => this.getTweet(r.id)),
        );
      }
    }

    return result;
  }

  async getConversationContext(tweetId: string, maxResults: number = 10) {
    const target = await this.getTweet(tweetId);
    const conversationId = getConversationId(target, tweetId);
    const replies = await this.request(
      "GET",
      buildConversationContextSearchUrl(conversationId, maxResults),
    );

    return {
      target,
      replies,
    };
  }

  async getTweetMetrics(tweetId: string) {
    const params = new URLSearchParams({
      "tweet.fields": "public_metrics,non_public_metrics,organic_metrics",
    });
    return this.request("GET", `${API_BASE}/tweets/${tweetId}?${params}`);
  }

  // ---- users ----

  async getUser(username: string) {
    const params = new URLSearchParams({
      "user.fields":
        "created_at,description,public_metrics,verified,profile_image_url,url,location,pinned_tweet_id",
    });
    return this.request(
      "GET",
      `${API_BASE}/users/by/username/${username}?${params}`,
    );
  }

  async getTimeline(
    userId: string,
    options: CursorPageRequest = { maxResults: 10 },
  ) {
    const params = new URLSearchParams({
      "tweet.fields":
        "created_at,public_metrics,author_id,conversation_id,entities,lang,note_tweet",
      expansions: "author_id,attachments.media_keys,referenced_tweets.id",
      "user.fields": "name,username,verified",
      "media.fields": "url,preview_image_url,type",
    });
    addCursorParams(params, options, 5, 100);
    return this.request(
      "GET",
      `${API_BASE}/users/${userId}/tweets?${params}`,
    );
  }

  async getFollowers(
    userId: string,
    options: CursorPageRequest = { maxResults: 100 },
  ) {
    const params = new URLSearchParams({
      "user.fields":
        "created_at,description,public_metrics,verified,profile_image_url",
    });
    addCursorParams(params, options, 1, 1000);
    return this.request(
      "GET",
      `${API_BASE}/users/${userId}/followers?${params}`,
    );
  }

  async getFollowing(
    userId: string,
    options: CursorPageRequest = { maxResults: 100 },
  ) {
    const params = new URLSearchParams({
      "user.fields":
        "created_at,description,public_metrics,verified,profile_image_url",
    });
    addCursorParams(params, options, 1, 1000);
    return this.request(
      "GET",
      `${API_BASE}/users/${userId}/following?${params}`,
    );
  }

  async getMentions(options: CursorPageRequest = { maxResults: 10 }) {
    const userId = await this.getAuthenticatedUserId();
    const params = new URLSearchParams({
      "tweet.fields":
        "created_at,public_metrics,author_id,conversation_id,entities,note_tweet",
      expansions: "author_id",
      "user.fields": "name,username,verified",
    });
    addCursorParams(params, options, 5, 100);
    return this.request(
      "GET",
      `${API_BASE}/users/${userId}/mentions?${params}`,
    );
  }

  // ---- engagement ----

  async likeTweet(tweetId: string) {
    const userId = await this.getAuthenticatedUserId();
    return this.request("POST", `${API_BASE}/users/${userId}/likes`, {
      tweet_id: tweetId,
    });
  }

  async retweet(tweetId: string) {
    const userId = await this.getAuthenticatedUserId();
    return this.request("POST", `${API_BASE}/users/${userId}/retweets`, {
      tweet_id: tweetId,
    });
  }

  // ---- bookmarks ----

  async getBookmarks(options: CursorPageRequest = { maxResults: 10 }) {
    const userId = await this.getAuthenticatedUserId();
    const params = new URLSearchParams({
      "tweet.fields":
        "created_at,public_metrics,author_id,conversation_id,entities,lang,note_tweet",
      expansions: "author_id,attachments.media_keys",
      "user.fields": "name,username,verified,profile_image_url",
      "media.fields": "url,preview_image_url,type",
    });
    addCursorParams(params, options, 1, 100);
    return this.request(
      "GET",
      `${API_BASE}/users/${userId}/bookmarks?${params}`,
    );
  }

  async bookmarkTweet(tweetId: string) {
    const userId = await this.getAuthenticatedUserId();
    return this.request("POST", `${API_BASE}/users/${userId}/bookmarks`, {
      tweet_id: tweetId,
    });
  }

  async unbookmarkTweet(tweetId: string) {
    const userId = await this.getAuthenticatedUserId();
    return this.request(
      "DELETE",
      `${API_BASE}/users/${userId}/bookmarks/${tweetId}`,
    );
  }
}

export function createClient(env: Env): XApiClient {
  return new XApiClient(env);
}

export {
  addCursorParams as _addCursorParams,
  buildConversationContextSearchUrl as _buildConversationContextSearchUrl,
  getConversationId as _getConversationId,
};
