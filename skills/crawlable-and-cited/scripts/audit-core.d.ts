export interface AuditOptions {
  paths?: string[];
  hosts?: string[];
  max?: number;
  delayMs?: number;
  titleMax?: number;
  userAgent?: string;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  deadlineMs?: number;
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
