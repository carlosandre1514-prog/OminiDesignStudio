import { Dices, ImageUp, Sparkles, Wand2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CATEGORY_LABELS, WEAPONS, type Category } from '@/modules/studio-3d/weapons/catalog';
import { useArsenal, weaponById } from '../store';
import { Btn, FOCUS, Section, Segmented, Slider, useProfile } from './ui';

export const EXAMPLES = [
  'Fuzil de assalto tático cal. 5.56 com acabamento cerakote preto fosco e mira holográfica',
  'M4 com red dot, PMAG, freio de boca e cerakote FDE',
  'Rifle de precisão .308 com luneta, bipé e supressor, camuflagem woodland',
  'Pistola 9mm compacta FDE com lanterna',
  'Submetralhadora com coronha dobrável, camuflado digital, desgastada',
  'Katana de aço damasco com cabo de tecido',
  'Sabre de luz vermelho',
];

/**
 * Text-to-3D and Image-to-3D panel.
 * Both run locally: the prompt is interpreted by a rule-based vocabulary that drives the
 * procedural generator; the image is segmented and its silhouette extruded.
 */
export function PromptPanel() {
  const p = useProfile();
  const { prompt, status, understood, ignored, imageLength } = useArsenal(useShallow((s) => ({ prompt: s.prompt, status: s.status, understood: s.understood, ignored: s.ignored, imageLength: s.imageLength })));
  const [text, setText] = useState(prompt || EXAMPLES[0]);
  const file = useRef<HTMLInputElement>(null);
  const busy = status.kind === 'busy';
  const run = () => void useArsenal.getState().generateFromPrompt(text);

  return (
    <Section title="Gerar (texto / imagem)" icon={<Sparkles size={16} />}>
      <label className="block">
        <span className="sr-only">Prompt de armamento</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run();
          }}
          rows={p === 'pc' ? 3 : 3}
          placeholder="Descreva a arma: tipo, calibre, acessórios, acabamento, camuflagem, desgaste…"
          aria-label="Prompt de armamento"
          data-testid="arsenal-prompt"
          className={`w-full resize-none rounded-lg border border-white/15 bg-black/40 p-3 font-mono text-zinc-100 placeholder:text-zinc-500 ${p === 'tv' ? 'text-lg' : p === 'mobile' ? 'text-base' : 'text-xs'} ${FOCUS} focus-visible:scale-100`}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Btn variant="primary" onClick={run} disabled={busy} data-testid="arsenal-generate" className="flex-1">
          <Wand2 size={16} /> Gerar a partir do texto
        </Btn>
        <Btn onClick={() => file.current?.click()} disabled={busy} data-testid="arsenal-image">
          <ImageUp size={16} /> Imagem → 3D
        </Btn>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          data-nav-skip
          data-testid="arsenal-image-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void useArsenal.getState().generateFromImage(f, f.name);
            e.target.value = '';
          }}
        />
      </div>
      <Slider label="Comprimento real (Imagem → 3D)" value={imageLength} min={0.15} max={2} step={0.05} format={(v) => `${Math.round(v * 100)} cm`} onChange={(v) => useArsenal.getState().set({ imageLength: v })} />
      <details className="text-zinc-400">
        <summary className={`cursor-pointer rounded ${p === 'tv' ? 'text-base' : 'text-xs'} ${FOCUS}`}>Exemplos de prompt</summary>
        <div className="mt-2 flex flex-col gap-1.5">
          {EXAMPLES.map((ex) => (
            <Btn key={ex} variant="ghost" className="justify-start text-left" onClick={() => setText(ex)}>
              {ex}
            </Btn>
          ))}
        </div>
      </details>
      {understood.length > 0 && (
        <div className={`rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-2 ${p === 'tv' ? 'text-base' : 'text-[11px]'}`} data-testid="arsenal-understood">
          <div className="mb-1 font-semibold text-cyan-200">Interpretado:</div>
          <div className="flex flex-wrap gap-1">
            {understood.map((u) => (
              <span key={u} className="rounded bg-cyan-400/15 px-1.5 py-0.5 text-cyan-100">{u}</span>
            ))}
          </div>
          {ignored.length > 0 && <div className="mt-1 text-zinc-500">Não reconhecido: {ignored.join(', ')}</div>}
        </div>
      )}
      <p className={`leading-snug text-zinc-500 ${p === 'tv' ? 'text-sm' : 'text-[10px]'}`}>
        Processado no aparelho, sem servidor e sem IA externa: o texto é interpretado por vocabulário técnico e a imagem vira um sólido pela silhueta (foto de lado, fundo liso ou PNG transparente).
      </p>
    </Section>
  );
}

/** Weapon type picker + procedural shape parameters. */
export function ModelPanel() {
  const { weaponId, params, source } = useArsenal(useShallow((s) => ({ weaponId: s.weaponId, params: s.params, source: s.source })));
  const weapon = weaponById(weaponId);
  const [cat, setCat] = useState<Category>(weapon.category);
  const st = useArsenal.getState;
  return (
    <Section title="Modelo procedural" icon={<Dices size={16} />} right={<Btn variant="ghost" onClick={() => st().randomize()} aria-label="Variação aleatória" data-testid="arsenal-random"><Dices size={16} /> Variar</Btn>}>
      <Segmented label="Categoria" value={cat} options={(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => ({ id: c, label: CATEGORY_LABELS[c] }))} onChange={(c) => { setCat(c); st().setWeapon(WEAPONS.find((w) => w.category === c)!.id); }} />
      <Segmented label="Tipo" value={source === 'image' ? '' : weaponId} options={WEAPONS.filter((w) => w.category === cat).map((w) => ({ id: w.id, label: w.name }))} onChange={(id) => st().setWeapon(id)} />
      {source === 'catalog' && (
        <>
          {weapon.nums.map((x) => (
            <Slider key={x.key} label={x.label} value={Number(params[x.key])} min={x.min} max={x.max} step={x.step} format={(v) => (x.unit === 'm' ? `${Math.round(v * 100)} cm` : `${v.toFixed(x.step < 1 ? 2 : 0)}${x.unit === '°' ? '°' : ''}`)} onChange={(v) => st().setParam(x.key, v)} />
          ))}
          {weapon.choices.map((c) => (
            <Segmented key={c.key} label={c.label} value={String(params[c.key])} options={c.options} onChange={(v) => st().setParam(c.key, v)} />
          ))}
        </>
      )}
    </Section>
  );
}
