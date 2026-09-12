'use client';

import { useSession } from '@/entities/session';
import {
  effectiveSiteConditions,
  hasSiteOverride,
  useSiteProfiles,
  type GroundSiteView,
} from '@/entities/ground-site';
import { cn, formatPercent } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import type { ClientMetrics, SiteProfileName } from '@/shared/api';

const PROFILE_ORDER: SiteProfileName[] = ['open', 'sea', 'forest', 'urban', 'mountain', 'custom'];

interface SiteConditionsControlProps {
  site: GroundSiteView;
  scenarioMaskDeg: number;
  metrics: ClientMetrics | undefined;
}

/**
 * What stands around one ground site.
 *
 * A named profile is a default mask with a reason attached; `custom` exposes
 * the number. The effective mask shown is the higher of the scenario's mask
 * and the local one, which is exactly what the engine applies — the control
 * never suggests a horizon lower than the terminal itself can use.
 */
export function SiteConditionsControl({ site, scenarioMaskDeg, metrics }: SiteConditionsControlProps) {
  const { state, dispatch } = useSession();
  const { t } = useI18n();
  const profiles = useSiteProfiles();

  const conditions = effectiveSiteConditions(site, state.config);
  const profile: SiteProfileName = conditions?.profile ?? 'open';
  const overridden = hasSiteOverride(site.id, state.config);
  const preset = profiles.data?.find((item) => item.id === profile);
  const localMask = conditions?.mask_deg ?? preset?.mask_deg ?? 0;
  const peakLocal = Math.max(localMask, ...(conditions?.azimuth_mask ?? []).map(([, el]) => el));
  const effectiveMask = Math.max(scenarioMaskDeg, peakLocal);

  const choose = (next: SiteProfileName) => {
    if (next === 'open') {
      // Open is the case's own assumption: clearing the block says so plainly
      // instead of storing a profile that changes nothing.
      dispatch({ type: 'setSiteConditions', siteId: site.id, conditions: null });
      return;
    }
    const chosen = profiles.data?.find((item) => item.id === next);
    dispatch({
      type: 'setSiteConditions',
      siteId: site.id,
      conditions:
        next === 'custom'
          ? { profile: 'custom', mask_deg: Math.max(localMask, scenarioMaskDeg) }
          : { profile: next, mask_deg: chosen?.mask_deg ?? null },
    });
  };

  const setCustomMask = (value: number) => {
    if (!Number.isFinite(value)) return;
    dispatch({
      type: 'setSiteConditions',
      siteId: site.id,
      conditions: { profile: 'custom', mask_deg: Math.min(89.9, Math.max(0, value)) },
    });
  };

  return (
    <div className="mt-2 border-t border-rule pt-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-label text-[10px] text-zinc-500">{t('site.surroundings')}</span>
        {overridden && (
          <button
            type="button"
            onClick={() => dispatch({ type: 'resetSiteConditions', siteId: site.id })}
            className="font-label text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-200 hover:underline focus-visible:outline-none"
          >
            {t('site.resetToFile')}
          </button>
        )}
      </div>

      <div className="mt-1.5 flex border border-rule-strong" role="radiogroup" aria-label={t('site.surroundings')}>
        {PROFILE_ORDER.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={profile === option}
            onClick={() => choose(option)}
            title={t(`site.profile.${option}` as 'site.profile.open')}
            className={cn(
              'flex-1 border-l border-rule-strong py-1 font-data text-[9px] tracking-[0.04em] transition-colors first:border-l-0 focus-visible:outline-none',
              profile === option ? 'bg-zinc-100 text-black' : 'text-zinc-500 hover:text-zinc-200',
            )}
          >
            {t(`site.token.${option}` as 'site.token.open')}
          </button>
        ))}
      </div>

      <div className="mt-1.5 flex items-center gap-2 font-data text-[10px] tabular-nums text-zinc-400">
        <span>{t('site.effectiveMask', { mask: effectiveMask.toFixed(1) })}</span>
        {profile === 'custom' && (
          <>
            <label htmlFor={`${site.id}-mask`} className="sr-only">
              {t('site.customMask')}
            </label>
            <input
              id={`${site.id}-mask`}
              type="number"
              min={0}
              max={89.9}
              step={0.5}
              value={localMask}
              onChange={(event) => setCustomMask(Number(event.target.value))}
              className="w-16 border border-rule-strong bg-black px-1.5 py-0.5 text-right text-zinc-200 focus:border-zinc-500 focus:outline-none"
            />
            <span>°</span>
          </>
        )}
        {conditions?.azimuth_mask?.length ? (
          <span className="text-zinc-600">{t('site.azimuthProfile')}</span>
        ) : null}
      </div>

      {profile !== 'custom' && preset?.rationale && (
        <p className="mt-1 font-label text-[10px] leading-relaxed text-zinc-500">{preset.rationale}</p>
      )}

      {metrics && metrics.masked_share > 0 && (
        <p className="mt-1 font-data text-[10px] tabular-nums text-alarm">
          {t('site.maskedShare', { share: formatPercent(metrics.masked_share) })}
        </p>
      )}
    </div>
  );
}
