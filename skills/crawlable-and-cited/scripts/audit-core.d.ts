export interface AuditOptions {
  paths?: string[];
  hosts?: string[];
  max?: number;
  delayMs?: number;
  titleMax?: number;
  userAgent?: string;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  deadlineMs?: number;
  /** Retries after a 429/502/503 or a thrown fetch error (default 2, with 5s then 10s backoff). Use 0 to fail fast.
   * Errors named 'GuardError' or with `noRetry: true` are never retried. */
  retries?: number;
}

export interface PageRow {
  url: string;
  status: number;
  h1?: number;
  words?: number;
  links?: number;
  title?: string;
  canonical?: string;
  robots?: string;
  siteName?: string;
  location?: string | null;
  /** The thrown fetch error's message, when the request failed without a response. */
  error?: string;
}

export interface Finding {
  level: 'FAIL' | 'WARN' | 'INCONCLUSIVE';
  check: string;
  detail: string;
}

export interface AuditReport {
  origin: string;
  rows: PageRow[];
  findings: Finding[];
  sitemapCount: number;
  truncated: boolean;
}

export function auditSite(origin: string, opts?: AuditOptions): Promise<AuditReport>;
