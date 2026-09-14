import type { ScenarioIssue } from '@/shared/api';
import { isTranslationKey as isKey, type Translate } from '@/shared/i18n';

const TYPE_NAMES = ['object', 'list', 'string', 'integer', 'number', 'boolean', 'null'];

const show = (value: unknown): string => {
  if (typeof value === 'string') return `«${value}»`;
  if (typeof value === 'number') return String(value);
  if (value === null || value === undefined) return '—';
  return JSON.stringify(value);
};

const typeName = (t: Translate, name: unknown) => {
  const key = `issue.type.${String(name)}`;
  return TYPE_NAMES.includes(String(name)) && isKey(key) ? t(key) : String(name);
};

const range = (params: Record<string, unknown>) =>
  `${params.min_inclusive === false ? '(' : '['}${params.min}; ${params.max}${
    params.max_inclusive === false ? ')' : ']'
  }`;









export function describeIssue(t: Translate, issue: ScenarioIssue): string {
  const key = `issue.${issue.code}`;
  if (!isKey(key)) return issue.message;

  const p = issue.params ?? {};
  const vars: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(p)) vars[name] = show(value);



  if (issue.code === 'wrong_type' && p.expected === 'integer' && p.actual === 'number') {
    return t('issue.not_whole');
  }

  switch (issue.code) {
    case 'wrong_type':
      vars.expected = typeName(t, p.expected);
      vars.actual = typeName(t, p.actual);
      break;
    case 'out_of_range':
      vars.range = range(p);
      break;
    case 'too_small':
      vars.relation = p.min_inclusive === false ? '>' : '≥';
      vars.min = show(p.min);
      break;
    case 'not_allowed':
      vars.allowed = Array.isArray(p.allowed) ? p.allowed.map(show).join(', ') : '—';
      break;
    case 'duplicate_id':
    case 'unknown_reference':

      if (typeof p.first === 'string') vars.first = p.first;
      if (typeof p.target === 'string') vars.target = p.target;
      break;
    case 'invalid_json':
      vars.reason = typeof p.reason === 'string' ? p.reason : issue.message;
      break;
  }


  for (const name of ['count', 'limit', 'steps', 'start_s', 'end_s', 'horizon_s', 'step_s', 'launch_stage']) {
    if (typeof p[name] === 'number') vars[name] = p[name] as number;
  }

  return t(key, vars);
}
