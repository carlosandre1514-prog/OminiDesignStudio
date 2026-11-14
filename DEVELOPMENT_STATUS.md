# DEVELOPMENT_STATUS

_Última atualização: 2026-11-14 (Fase 3)_

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

### ✅ Fase 3 — Asset Library
- Tabelas `assets`, `assetData` e `folders` no mesmo IndexedDB (migração automática v1 → v2).
- Armazenamento por conteúdo (SHA-256): arquivos idênticos são guardados uma única vez; importar um arquivo já existente reaproveita o asset; "Duplicar" copia só os metadados; os bytes são removidos quando nenhum asset os referencia.
- Importação validada (extensão **e** conteúdo/magic bytes, limite de tamanho configurável): PNG, JPG/JPEG, WEBP, GIF, SVG, MP3, WAV, OGG, TTF, OTF, WOFF, WOFF2, GLB, GLTF, OBJ, MTL, FBX, STL. Arquivos 3D são armazenados e catalogados; a visualização 3D chega na Fase 4.
- Miniaturas (imagens/SVG), dimensões e duração de áudio extraídas na importação; pré-visualização de imagens, player de áudio e amostra de fontes (FontFace).
- 14 categorias do blueprint, pastas aninhadas (criar, renomear, excluir sem perder conteúdo, arrastar assets para pastas, proteção contra ciclos), tags, favoritos, busca, filtros por tipo/categoria/tag/pasta, ordenação.
- Renomear, duplicar, excluir (com aviso de projetos vinculados), baixar, seleção múltipla com mover/vincular/exportar/excluir em lote.
- Vínculo de assets a projetos (manual ou automático ao usar no editor); excluir um projeto remove apenas o vínculo.
- Biblioteca global (`/assets`) e aba "Asset Library" dentro de cada projeto (escopo "deste projeto" / "toda a biblioteca").
- Exportação ZIP de assets (com `manifest.json`) e importação de ZIP (pacote do OmniDesign ou ZIP simples de arquivos).
- Pacote de projeto `.zip` (project.omni + assets + manifest): exportação e importação com remapeamento das referências (inclusive nas versões), deduplicação contra a biblioteca local e **detecção de dependências ausentes**. Importar `.omni` também avisa sobre assets ausentes. Detecção de ZIP pelo conteúdo.
- Backup completo agora gera um pacote ZIP por projeto + a biblioteca inteira (todos reimportáveis).
- Integração com o Web Design: "Escolher da biblioteca" e "Enviar imagem" (que importa para a biblioteca) no elemento Imagem; referências `asset:<id>` resolvidas no canvas e no protótipo; aviso visual de asset ausente; exportação HTML/React inclui os arquivos (`assets/` ou `public/assets/`).
- Dashboard e Armazenamento exibem estatísticas da biblioteca (incluindo economia por deduplicação).

## Fases em andamento
Nenhuma. Próxima: **Fase 4 — 3D Design Studio**.

## Funcionalidades pendentes (conhecidas)
- Fase 2: ajustes manuais por breakpoint (overrides de posição/tamanho por dispositivo); rotação de elementos; biblioteca de componentes reutilizáveis (componentes mestre/instâncias); transições animadas entre telas no protótipo; biblioteca de ícones (o elemento ícone usa um glifo de texto); variantes de estado além de hover (pressed/disabled).
- Fase 1: autenticação e sincronização em nuvem (Fase 6).
- Fase 3: fontes da biblioteca ainda não aparecem como opção de fonte no Web Design; visualização de modelos 3D (Fase 4); geração de miniatura para modelos 3D (Fase 4); materiais/prefabs/componentes como tipos próprios de asset (hoje são categorias de organização).
- Fases 3 a 7 conforme o roadmap (Asset Library, 3D Studio, Game Design Studio, sistemas avançados, app nativo via Capacitor).

## Erros conhecidos
- Nenhum erro crítico conhecido.
- O ponto de restauração automático usa o intervalo vigente ao abrir o projeto; alterar a configuração vale a partir do próximo projeto aberto.
- Tamanho de projeto exibido é aproximado (tamanho do JSON serializado).

## Testes realizados
- `npm test` — 48 testes (Vitest, IndexedDB simulado por fake-indexeddb):
  - histórico (commit/undo/redo/gestos/limite);
  - serviço de projetos (CRUD, favoritos, duplicação profunda, versões, restauração não destrutiva, poda de versões automáticas, export/import `.omni`, validação de arquivos corrompidos, exclusão em cascata);
  - operações do editor (mover, grupos, redimensionar grupos, exclusão em cascata, duplicação com remapeamento, ordem Z, alinhar/distribuir, smart snap, telas, normalização de dados corrompidos);
  - layout responsivo e exportadores (HTML escapado e sem URLs inseguras, React, Tailwind, ZIP);
  - store do editor (persistência, undo/redo, gesto único, copiar/colar, recuperação após reinício);
  - Asset Library (validação por conteúdo de todos os formatos, limites, deduplicação, duplicação com bytes compartilhados e coleta de lixo, tags/filtros/busca, pastas sem perda de conteúdo, vínculo e desvinculação ao excluir projeto, exportação/importação ZIP);
  - pacotes de projeto (busca/reescrita de referências, ida e volta em biblioteca vazia com remapeamento inclusive nas versões, reaproveitamento, dependências ausentes, ZIP inválido).
- `npm run test:e2e` — fluxo completo no navegador (Chromium): criar projeto por modelo, inserir, arrastar, desfazer/refazer, editar texto, protótipo com navegação e modal, troca de dispositivo, exportação, persistência após recarregar, dashboard, indicador offline, layout mobile sem rolagem horizontal, ausência de erros no console. ✅
- `e2e/assets.mjs` — importação (válidos, inválido rejeitado, duplicado reaproveitado), renomear/tag/filtro, pastas, imagem da biblioteca no canvas, exportação HTML com o arquivo do asset, aba do projeto, exportação e reimportação do pacote do projeto. ✅
- Verificação manual: os projetos React e React+Tailwind exportados passam em `tsc` e `vite build` e executam o protótipo (navegação + modal) corretamente.

## Próximas tarefas
1. Fase 4 — 3D Design Studio: viewport (Three.js/R3F, carregado sob demanda), primitivas, transformações, modo de edição, materiais PBR com texturas da biblioteca, iluminação, importação GLB/GLTF/OBJ/FBX/STL a partir da biblioteca e exportação GLB/GLTF/OBJ/STL/PNG.
2. Fontes da biblioteca no Web Design.
3. Pendências da Fase 2 listadas acima.
