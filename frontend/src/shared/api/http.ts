import { API_BASE } from '@/shared/config';
import type { ProblemDocument, ScenarioIssue } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;

  readonly issues: ScenarioIssue[];

  readonly issueCount: number;

  constructor(problem: ProblemDocument) {
    super(problem.detail || problem.title);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.error_code;
    this.field = problem.details?.field ?? undefined;
    this.issues = Array.isArray(problem.details?.issues) ? problem.details.issues : [];
    this.issueCount = problem.details?.issue_count ?? this.issues.length;
  }
}

const isProblem = (value: unknown): value is ProblemDocument =>
  typeof value === 'object' && value !== null && 'error_code' in value && 'status' in value;

async function toError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (isProblem(body)) return new ApiError(body);

  return new ApiError({
    type: 'about:blank',
    title: response.statusText || 'Request failed',
    status: response.status,
    detail: response.statusText || `Request failed with ${response.status}`,
    error_code: 'HTTP_ERROR',
    instance: response.url,
    timestamp: new Date().toISOString(),
  });
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined>;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, query } = options;

  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    signal,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export function downloadUrl(path: string): string {
  return `${API_BASE}${path}`;
}
