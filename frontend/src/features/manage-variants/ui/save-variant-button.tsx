'use client';

import { useState } from 'react';
import { BookmarkPlus } from 'lucide-react';
import { useSaveVariant } from '@/entities/variant';
import { useSession } from '@/entities/session';
import { normalizeConfig } from '@/entities/simulation';
import { Button, ErrorNote } from '@/shared/ui';
import { useI18n } from '@/shared/i18n';

export function SaveVariantButton({ suggestedName }: { suggestedName: string }) {
  const { state } = useSession();
  const { t } = useI18n();
  const saveVariant = useSaveVariant();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(suggestedName);

  if (!state.scenarioId) return null;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    saveVariant.mutate({
      name: trimmed,
      scenario_id: state.scenarioId as string,
      config: normalizeConfig(state.config),
      strategy: state.strategy,
    });
    setEditing(false);
  };

  if (!editing) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => {
          setName(suggestedName);
          setEditing(true);
        }}
      >
        <BookmarkPlus size={13} />
        {t('variant.save')}
      </Button>
    );
  }

  return (
    <div className="space-y-2 border border-rule-strong p-2">
      <label htmlFor="variant-name" className="block font-label text-[11px] text-zinc-400">
        {t('variant.name')}
      </label>
      <input
        id="variant-name"
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
          if (event.key === 'Escape') setEditing(false);
        }}
        className="w-full border border-rule-strong bg-black px-2 py-1.5 font-data text-[11px] text-zinc-100 focus:border-zinc-500 focus:outline-none"
      />
      <div className="flex gap-2">
        <Button size="sm" variant="solid" className="flex-1" onClick={submit}>
          {t('variant.confirm')}
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(false)}>
          {t('variant.cancel')}
        </Button>
      </div>
      {saveVariant.isError && <ErrorNote error={saveVariant.error} />}
    </div>
  );
}
