# OmniDesign Studio

Plataforma universal de criação digital (Web App/PWA, futuramente Android/iOS via Capacitor) que reúne em um único ecossistema ferramentas de Web/UI/App Design, Game Design, 3D e gerenciamento de assets.

> Status atual: **Fase 1 (Fundação) e Fase 2 (Web & App Design) entregues.** Veja [`DEVELOPMENT_STATUS.md`](DEVELOPMENT_STATUS.md) para o que está pronto, pendente e testado.

## Executar

```bash
npm install
npm run dev          # servidor de desenvolvimento
npm run build        # typecheck + build de produção (dist/)
npm run preview      # serve o build
npm test             # testes unitários/integrados (Vitest + fake-indexeddb)
npm run test:e2e     # smoke test E2E com Playwright (requer `npm run build && npm run preview -- --port 4173` em outro terminal)
```

## Stack

React 19 · Vite 6 · TypeScript (strict) · Tailwind CSS 4 · Zustand 5 · React Router 7 · Dexie 4 (IndexedDB) · JSZip · Vitest.

As tecnologias de 3D (Three.js/R3F/Rapier) e Capacitor entram nas fases correspondentes e serão carregadas sob demanda.

## Estrutura

```
src/
  core/            serviços compartilhados por todos os módulos
    db/            banco IndexedDB único (Dexie)
    projects/      projetos, documentos, versões, histórico, import/export .omni
    history/       pilha de desfazer/refazer imutável
    modules/       registro de módulos (base do sistema de plugins)
    settings/      configurações persistidas
    utils/         ids, debounce, sanitização, download
  modules/
    index.ts       registro dos módulos (carregamento sob demanda)
    web-design/    Web & App Design Studio (modelo, operações, export, UI)
  pages/           Dashboard, Projetos, Modelos, Histórico, Armazenamento, Configurações, Workspace
  templates/       modelos de projeto
  ui/              shell, diálogos, toasts, error boundary
e2e/               teste E2E (Playwright)
docs/              decisões técnicas
```

Mais detalhes em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
