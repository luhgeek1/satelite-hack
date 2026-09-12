'use client';

import { useEffect } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { describeIssue } from '@/entities/scenario';
import type { ScenarioImported, ScenarioIssue } from '@/shared/api';
import { useI18n } from '@/shared/i18n';

export type ImportOutcome =
  | { kind: 'failed'; issues: ScenarioIssue[]; count: number }
  | { kind: 'loaded'; scenario: ScenarioImported };

/** Long enough to read the contents line, short enough not to linger. */
const LOADED_VISIBLE_MS = 8000;
/** A file wrong in forty places is fixed from the top; the rest can wait. */
const VISIBLE_ISSUES = 8;

function IssueList({ issues }: { issues: ScenarioIssue[] }) {
  const { t } = useI18n();

  return (
    <ul className="space-y-1.5">
      {issues.map((issue, index) => (
        <li key={`${issue.field}-${issue.code}-${index}`} className="min-w-0">
          <div className="font-label text-[12px] leading-snug text-zinc-200">
            {describeIssue(t, issue)}
          </div>
          {issue.field && (
            <div className="mt-0.5 break-all font-data text-[10px] text-zinc-500">{issue.field}</div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * What came of loading a file: every problem with the field it is in, or what
 * was loaded and anything worth a second look.
 *
 * The case asks the service to say which data needs fixing, and the person
 * loading the file did not write it — so the path to each value is shown
 * under its sentence, in the same notation the file uses.
 */
export function ImportReport({ outcome, onDismiss }: { outcome: ImportOutcome; onDismiss: () => void }) {
  const { t } = useI18n();
  const quiet = outcome.kind === 'loaded' && outcome.scenario.warnings.length === 0;

  // A clean import confirms itself and gets out of the way; anything that
  // needs reading stays until it is closed.
  useEffect(() => {
    if (!quiet) return;
    const timer = window.setTimeout(onDismiss, LOADED_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [quiet, onDismiss]);

  const failed = outcome.kind === 'failed';

  return (
    <div
      role={failed ? 'alert' : 'status'}
      className={
        failed
          ? 'max-h-[60vh] overflow-y-auto border border-alarm/40 bg-black px-3 py-2.5'
          : 'max-h-[60vh] overflow-y-auto border border-rule-strong bg-black px-3 py-2.5'
      }
    >
      <div className="mb-2 flex items-start gap-2">
        {failed ? (
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0 text-alarm" />
        ) : (
          <Check size={13} className="mt-0.5 flex-shrink-0 text-zinc-300" />
        )}
        <div className="min-w-0 flex-1">
          <div className={failed ? 'font-label text-[12px] text-alarm' : 'font-label text-[12px] text-zinc-100'}>
            {failed ? t('import.failed') : t('import.loaded')}
          </div>
          <div className="mt-0.5 font-data text-[10px] text-zinc-500">
            {outcome.kind === 'failed'
              ? t('import.problemCount', { count: outcome.count })
              : outcome.scenario.title}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('import.dismiss')}
          className="-mr-1 flex-shrink-0 p-1 text-zinc-600 transition-colors hover:text-zinc-200"
        >
          <X size={13} />
        </button>
      </div>

      {outcome.kind === 'failed' ? (
        <>
          <IssueList issues={outcome.issues.slice(0, VISIBLE_ISSUES)} />
          {outcome.count > VISIBLE_ISSUES && (
            <div className="mt-2 font-data text-[10px] text-zinc-500">
              {t('import.more', { count: outcome.count - VISIBLE_ISSUES })}
            </div>
          )}
          <div className="mt-2 border-t border-rule pt-2 font-label text-[11px] text-zinc-500">
            {t('import.fix')}
          </div>
        </>
      ) : (
        <>
          <div className="font-data text-[10px] tabular-nums text-zinc-400">
            {t('import.contents', {
              satellites: outcome.scenario.satellite_count,
              planes: outcome.scenario.plane_count,
              clients: outcome.scenario.client_count,
              gateways: outcome.scenario.gateway_count,
              steps: outcome.scenario.steps,
            })}
          </div>
          {outcome.scenario.from_result_file && (
            <div className="mt-2 font-label text-[11px] text-zinc-400">{t('import.fromResult')}</div>
          )}
          {outcome.scenario.warnings.length > 0 && (
            <div className="mt-2 border-t border-rule pt-2">
              <div className="mb-1.5 font-data text-[9px] tracking-[0.08em] text-zinc-500 uppercase">
                {t('import.warnings')}
              </div>
              <IssueList issues={outcome.scenario.warnings} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
