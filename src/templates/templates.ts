import type { ProjectCategory } from '@/core/projects/types';
import { createElement, createEmptyDoc, createScreen, type WebDesignDoc } from '@/modules/web-design/model';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: ProjectCategory;
  /** Builds the initial module data. Each call creates fresh ids. */
  build(): Record<string, unknown>;
}

function blank(width: number, height: number): WebDesignDoc {
  const doc = createEmptyDoc(width, height);
  doc.screens[0].name = 'Tela 1';
  return doc;
}

function landingPage(): WebDesignDoc {
  const doc = createEmptyDoc(1280, 900);
  const s = doc.screens[0];
  s.name = 'Início';
  const nav = createElement('navbar', 0, 0, { w: 1280, h: 64, text: 'Minha Marca', name: 'Navegação' });
  const title = createElement('text', 120, 170, { w: 700, h: 140, text: 'Crie algo incrível com o seu produto', name: 'Título', style: { ...createElement('text', 0, 0).style, fontSize: 52, fontWeight: 700 } });
  const sub = createElement('text', 120, 320, { w: 620, h: 60, text: 'Descreva aqui a proposta de valor em uma ou duas frases.', name: 'Subtítulo', style: { ...createElement('text', 0, 0).style, fontSize: 20, textColor: '#4b5563' } });
  const cta = createElement('button', 120, 410, { w: 180, h: 52, text: 'Começar agora', name: 'CTA' });
  const cards = [0, 1, 2].map((i) =>
    createElement('card', 120 + i * 360, 560, { w: 320, h: 200, text: `Recurso ${i + 1}`, subtext: 'Explique o benefício deste recurso.', name: `Card ${i + 1}` }),
  );
  s.elements.push(nav, title, sub, cta, ...cards);
  return doc;
}

function mobileApp(): WebDesignDoc {
  const doc = createEmptyDoc(390, 844);
  const login = doc.screens[0];
  login.name = 'Login';
  const home = createScreen('Home', 390, 844);
  home.background = '#f9fafb';
  const t = createElement('text', 24, 120, { w: 342, h: 44, text: 'Bem-vindo', name: 'Título', style: { ...createElement('text', 0, 0).style, fontSize: 32, fontWeight: 700 }, constraintH: 'stretch' });
  const email = createElement('input', 24, 220, { w: 342, h: 48, placeholder: 'E-mail', name: 'E-mail', constraintH: 'stretch' });
  const pass = createElement('input', 24, 284, { w: 342, h: 48, placeholder: 'Senha', name: 'Senha', constraintH: 'stretch' });
  const btn = createElement('button', 24, 360, { w: 342, h: 52, text: 'Entrar', name: 'Entrar', constraintH: 'stretch', interaction: { type: 'navigate', screenId: home.id } });
  login.elements.push(t, email, pass, btn);
  const header = createElement('navbar', 0, 0, { w: 390, h: 64, text: 'App', items: ['Perfil'], name: 'Cabeçalho' });
  const modal = createElement('modal', 35, 300, { w: 320, h: 200, name: 'Modal de detalhes', text: 'Detalhes', subtext: 'Conteúdo exibido ao tocar no card.' });
  const card = createElement('card', 24, 96, { w: 342, h: 160, text: 'Card de exemplo', subtext: 'Toque para abrir o modal.', name: 'Card', constraintH: 'stretch', interaction: { type: 'toggle', targetId: modal.id } });
  const back = createElement('button', 24, 760, { w: 342, h: 48, text: 'Sair', name: 'Sair', constraintH: 'stretch', constraintV: 'bottom', interaction: { type: 'navigate', screenId: login.id } });
  // Tapping the modal closes it again.
  modal.interaction = { type: 'toggle', targetId: modal.id };
  modal.subtext = 'Conteúdo exibido ao tocar no card. Toque aqui para fechar.';
  home.elements.push(header, card, back, modal);
  doc.screens.push(home);
  return doc;
}

export const TEMPLATES: ProjectTemplate[] = [
  { id: 'blank-web', name: 'Web em branco', description: 'Canvas desktop 1280×800.', category: 'web', build: () => ({ 'web-design': blank(1280, 800) }) },
  { id: 'blank-app', name: 'App em branco', description: 'Canvas mobile 390×844.', category: 'app', build: () => ({ 'web-design': blank(390, 844) }) },
  { id: 'landing', name: 'Landing page', description: 'Navegação, hero, CTA e cards de recursos.', category: 'web', build: () => ({ 'web-design': landingPage() }) },
  { id: 'mobile-flow', name: 'Fluxo mobile', description: 'Login → Home com navegação e modal prototipados.', category: 'app', build: () => ({ 'web-design': mobileApp() }) },
];

/** Default starting content for a project category without a template. */
export function defaultModulesFor(category: ProjectCategory): Record<string, unknown> {
  if (category === 'app') return { 'web-design': blank(390, 844) };
  if (category === 'web' || category === 'mixed') return { 'web-design': blank(1280, 800) };
  return {};
}
