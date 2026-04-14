/**
 * Centralized URL construction for the threads area.
 *
 * All navigation to `/threads` routes should go through these functions
 * so that `?project=` and `?request=` params are always handled consistently.
 */

export interface ThreadUrlOptions {
  projectPath?: string | null;
  requestKey?: string | null;
}

function buildQueryString(opts: ThreadUrlOptions): string {
  const params = new URLSearchParams();
  if (opts.projectPath) {
    params.set('project', opts.projectPath);
  }
  if (opts.requestKey) {
    params.set('request', opts.requestKey);
  }
  const q = params.toString();
  return q ? `?${q}` : '';
}

/** `/threads` — project list, optionally with query params. */
export function threadsUrl(opts: ThreadUrlOptions = {}): string {
  return `/threads${buildQueryString(opts)}`;
}

/** `/threads?project=<encoded>` — sessions list for a project. */
export function projectSessionsUrl(
  projectPath: string,
  opts: Omit<ThreadUrlOptions, 'projectPath'> = {},
): string {
  return threadsUrl({ ...opts, projectPath });
}

/** `/threads/:threadId` with optional project and request params. */
export function threadUrl(
  threadId: string,
  opts: ThreadUrlOptions = {},
): string {
  return `/threads/${encodeURIComponent(threadId)}${buildQueryString(opts)}`;
}

// ---------------------------------------------------------------------------
// Query-param readers (used in hooks and layout)
// ---------------------------------------------------------------------------

export function readProjectPath(searchParams: URLSearchParams): string | null {
  const raw = searchParams.get('project');
  if (!raw) return null;
  return decodeURIComponent(raw);
}

export function readRequestKey(searchParams: URLSearchParams): string | null {
  return searchParams.get('request') ?? null;
}
