import { describe, expect, it } from 'vitest';
import { normalize, parsePrompt } from './promptParser';

describe('parsePrompt (local text-to-3D)', () => {
  it('reads the example prompt', () => {
    const r = parsePrompt('Fuzil de assalto tático cal. 5.56 com acabamento cerakote preto fosco e mira holográfica');
    expect(r.weapon.id).toBe('ar15-hd');
    expect(r.params.optic).toBe('holo');
    expect(r.finish.polymer).toBe('preto');
    expect(r.finish.steel).toBe('escuro');
    expect(r.camo?.pattern).toBe('solido');
    expect(r.understood.join(' ')).toMatch(/Holográfica/);
    expect(parsePrompt('AK-47 com coronha rebatível').weapon.id).toBe('ak-hd');
    expect(parsePrompt('M4 com red dot, PMAG e freio de boca').params).toMatchObject({ optic: 'reddot', mag: 'polimero', muzzle: 'freio' });
  });

  it('detects types, attachments, size, wear and camo', () => {
    const s = parsePrompt('sniper .308 com bipé, supressor e camuflagem woodland, bem desgastado');
    expect(s.weapon.id).toBe('sniper-hd');
    expect(s.params.bipod).toBe('aberto');
    expect(s.params.muzzle).toBe('supressor');
    expect(s.camo?.pattern).toBe('woodland');
    expect(s.finish.wear).toBeGreaterThan(0.7);
    expect(Number(s.params.barrel)).toBeGreaterThan(0.7);
    expect(s.ignored).not.toContain('desgastado');

    const k = parsePrompt('Katana com lâmina de damasco e cabo de tecido');
    expect(k.weapon.id).toBe('katana');
    expect(k.finish.steel).toBe('damasco');
    expect(k.finish.grip).toBe('tecido');

    expect(parsePrompt('submetralhadora compacta FDE com coronha dobrável').params.stock).toBe('retratil');
    expect(parsePrompt('espingarda pump tática').weapon.id).toBe('shotgun-hd');
    expect(parsePrompt('sabre de luz vermelho').finish.energy).toBe('vermelho');
    expect(parsePrompt('glock 9mm nova').finish.wear).toBeLessThan(0.1);
  });

  it('falls back to a default type and reports unknown words', () => {
    const r = parsePrompt('objeto misterioso flutuante');
    expect(r.understood[0]).toMatch(/padrão/);
    expect(r.ignored).toContain('misterioso');
  });

  it('normalizes accents', () => {
    expect(normalize('Lâmina  Tática!')).toBe('lamina tatica');
  });
});
