# DEVELOPMENT_STATUS

_Última atualização: 2026-11-14_

## Fases concluídas

### ✅ Fase 1 — Fundação
- Projeto Vite + React 19 + TypeScript strict + Tailwind 4 + Zustand + React Router + Dexie.
- Estrutura modular (`core/`, `modules/`, `pages/`, `ui/`, `templates/`), registro de módulos com carregamento sob demanda.
- Dashboard: novo projeto, abrir/importar, recentes, favoritos, modelos, contadores, indicadores online/offline e de sincronização.
- Páginas: Projetos (busca, filtro por categoria, favoritos, ordenação), Modelos, Histórico global, Armazenamento (cota do navegador, persistência, tamanho por projeto, backup completo em ZIP, limpeza de versões automáticas), Configurações persistidas.
- Projetos com nome, descrição, categoria, tags, miniatura (gerada do conteúdo), datas de criação/modificação/abertura e local de armazenamento.
- Ações: criar, renomear/editar, favoritar, duplicar, excluir, exportar/importar `.omni`.
- Versionamento: pontos de restauração manuais e automáticos, restauração não destrutiva, histórico de alterações por projeto.
- Salvamento automático + manual (Ctrl+S), recuperação após recarregar/fechar, error boundaries.
- PWA: manifest + service worker (cache do app shell para uso offline).

### ✅ Fase 2 — Web & App Design Studio
- Canvas: zoom (botões, Ctrl+roda, pinça em touch), pan (ferramenta mão, Espaço, botão do meio, roda), réguas, guias arrastáveis a partir das réguas (remover arrastando de volta), grid configurável com snap, alinhamento inteligente com linhas de referência (bordas/centros de elementos, tela e guias).
- Seleção simples, múltipla (Shift/Ctrl) e por retângulo; mover, redimensionar (8 alças, Shift mantém proporção, Alt ignora snap), setas para mover (Shift = 10px).
- Agrupar/desagrupar (aninhável), camadas com hierarquia, renomear, ocultar, bloquear, ordem Z.
- Copiar/recortar/colar/duplicar, excluir, selecionar tudo, desfazer/refazer.
- Componentes: painel, elipse, texto, botão, imagem (URL ou upload), ícone, input, card, barra de navegação, menu, modal — com dimensões, cores, borda, raio, sombra, opacidade, padding, tipografia e estado hover.
- Edição de texto inline (duplo clique).
- Múltiplas telas (criar, renomear, duplicar, reordenar, excluir) com predefinições de dispositivo.
- Responsividade por constraints horizontais/verticais; pré-visualização em smartphone, tablet, notebook, desktop, Full HD, ultrawide, tamanho personalizado e rotação.
- Prototipagem: navegação entre telas, mostrar/ocultar elementos (modais), links externos, elementos ocultos ao iniciar, voltar, reiniciar estados; modo Apresentação e tela cheia.
- Exportação: HTML+CSS(+JS de interações), React+TypeScript (projeto Vite), React+TypeScript+Tailwind; visualização do código, copiar, baixar arquivo e ZIP.

## Fases em andamento
Nenhuma. Próxima: **Fase 3 — Asset Library**.

## Funcionalidades pendentes (conhecidas)
- Fase 2: ajustes manuais por breakpoint (overrides de posição/tamanho por dispositivo); rotação de elementos; biblioteca de componentes reutilizáveis (componentes mestre/instâncias); transições animadas entre telas no protótipo; biblioteca de ícones (o elemento ícone usa um glifo de texto); variantes de estado além de hover (pressed/disabled).
- Fase 1: importação de projetos em ZIP (planejada junto à Fase 3); autenticação e sincronização em nuvem (Fase 6).
- Fases 3 a 7 conforme o roadmap (Asset Library, 3D Studio, Game Design Studio, sistemas avançados, app nativo via Capacitor).

## Erros conhecidos
- Nenhum erro crítico conhecido.
- O ponto de restauração automático usa o intervalo vigente ao abrir o projeto; alterar a configuração vale a partir do próximo projeto aberto.
- Tamanho de projeto exibido é aproximado (tamanho do JSON serializado).

## Testes realizados
- `npm test` — 34 testes (Vitest, IndexedDB simulado por fake-indexeddb):
  - histórico (commit/undo/redo/gestos/limite);
  - serviço de projetos (CRUD, favoritos, duplicação profunda, versões, restauração não destrutiva, poda de versões automáticas, export/import `.omni`, validação de arquivos corrompidos, exclusão em cascata);
  - operações do editor (mover, grupos, redimensionar grupos, exclusão em cascata, duplicação com remapeamento, ordem Z, alinhar/distribuir, smart snap, telas, normalização de dados corrompidos);
  - layout responsivo e exportadores (HTML escapado e sem URLs inseguras, React, Tailwind, ZIP);
  - store do editor (persistência, undo/redo, gesto único, copiar/colar, recuperação após reinício).
- `npm run test:e2e` — fluxo completo no navegador (Chromium): criar projeto por modelo, inserir, arrastar, desfazer/refazer, editar texto, protótipo com navegação e modal, troca de dispositivo, exportação, persistência após recarregar, dashboard, indicador offline, layout mobile sem rolagem horizontal, ausência de erros no console. ✅
- Verificação manual: os projetos React e React+Tailwind exportados passam em `tsc` e `vite build` e executam o protótipo (navegação + modal) corretamente.

## Próximas tarefas
1. Fase 3 — Asset Library: tabela `assets` (Blob + metadados) no mesmo banco, pastas, tags, busca/filtros, miniaturas, favoritos, importação validada de mídia (PNG/JPG/WEBP/SVG/MP3/WAV/OGG/TTF/WOFF2), vínculo de assets a projetos, exportação ZIP e importação de projetos ZIP.
2. Integrar a Asset Library ao Web Design (inserir imagens/ícones/fontes a partir da biblioteca).
3. Pendências da Fase 2 listadas acima.
