# OmniDesign Studio

Plataforma universal de criação digital (Web App/PWA, futuramente Android/iOS via Capacitor) que reúne em um único ecossistema ferramentas de Web/UI/App Design, Game Design, 3D e gerenciamento de assets.

> Status atual: **Fases 1 (Fundação), 2 (Web & App Design) e 3 (Asset Library) entregues, além de login e sincronização em nuvem (Supabase).** Veja [`DEVELOPMENT_STATUS.md`](DEVELOPMENT_STATUS.md) para o que está pronto, pendente e testado.

## Executar

```bash
npm install
npm run dev          # servidor de desenvolvimento
npm run build        # typecheck + build de produção (dist/)
npm run preview      # serve o build
npm test             # testes unitários/integrados (Vitest + fake-indexeddb)
npm run test:sql     # script SQL do Supabase num PostgreSQL 16 local (RLS, revisões)
npm run test:e2e     # testes E2E com Playwright (requer `npm run build && npm run preview -- --port 4173` em outro terminal)
```

## Stack

React 19 · Vite 6 · TypeScript (strict) · Tailwind CSS 4 · Zustand 5 · React Router 7 · Dexie 4 (IndexedDB) · Supabase (auth + sync) · JSZip · Vitest.

As tecnologias de 3D (Three.js/R3F/Rapier) e Capacitor entram nas fases correspondentes e serão carregadas sob demanda.

## Estrutura

```
src/
  core/            serviços compartilhados por todos os módulos
    assets/        biblioteca de assets (formatos, validação, armazenamento, URLs)
    db/            banco IndexedDB único (Dexie)
    projects/      projetos, documentos, versões, histórico, import/export .omni
    history/       pilha de desfazer/refazer imutável
    modules/       registro de módulos (base do sistema de plugins)
    settings/      configurações persistidas
    utils/         ids, debounce, sanitização, download
  modules/
    index.ts       registro dos módulos (carregamento sob demanda)
    web-design/    Web & App Design Studio (modelo, operações, export, UI)
    asset-library/ UI da biblioteca, seletor de assets
  pages/           Dashboard, Projetos, Modelos, Histórico, Armazenamento, Configurações, Workspace
  templates/       modelos de projeto
  ui/              shell, diálogos, toasts, error boundary
e2e/               teste E2E (Playwright)
docs/              decisões técnicas
```

Mais detalhes em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Configuração da nuvem em [`docs/CLOUD_SETUP.md`](docs/CLOUD_SETUP.md).
