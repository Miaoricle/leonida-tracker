// Reads the private leonida-data repo through the GitHub REST API with a fine-grained, read-only token.
// The token is only ever sent to https://api.github.com.
const API = 'https://api.github.com';

export interface RepoConfig { owner: string; repo: string; branch: string; token: string }
export const DEFAULT_REPO = { owner: 'Miaoricle', repo: 'leonida-data', branch: 'main' };
export const DATA_FILES = ['meta', 'markers', 'categories', 'labels'] as const;
export type DataFile = (typeof DATA_FILES)[number];

export class GitHubError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

function headers(token: string, etag?: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.raw+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (etag) h['If-None-Match'] = etag;
  return h;
}

function explain(status: number): string {
  if (status === 401) return 'The token was rejected (expired or mistyped).';
  if (status === 403) return 'The token can\'t read this repo, or the rate limit was hit. Check it has Contents: Read-only.';
  if (status === 404) return 'Repo or file not found. Check the repo name and that the token includes leonida-data.';
  return `GitHub returned ${status}.`;
}

/** "Test connection": checks the token can read the repo. */
export async function testConnection(c: RepoConfig): Promise<{ private: boolean; fullName: string }> {
  const r = await fetch(`${API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`, { headers: { ...headers(c.token), Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!r.ok) throw new GitHubError(explain(r.status), r.status);
  const j = await r.json();
  return { private: !!j.private, fullName: j.full_name };
}

/** Fetch one data file. Returns null when the server says it's unchanged (304 for the given ETag). */
export async function fetchFile(c: RepoConfig, file: DataFile, etag?: string): Promise<{ json: unknown; etag?: string } | null> {
  const url = `${API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/data/${file}.json?ref=${encodeURIComponent(c.branch)}`;
  const r = await fetch(url, { headers: headers(c.token, etag), cache: 'no-store' });
  if (r.status === 304) return null;
  if (!r.ok) throw new GitHubError(explain(r.status), r.status);
  return { json: await r.json(), etag: r.headers.get('ETag') ?? undefined };
}
