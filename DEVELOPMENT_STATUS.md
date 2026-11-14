# DEVELOPMENT_STATUS

_Última atualização: 2026-11-14 (Fase 4 — 3D Design Studio)_

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

### ✅ Pendências das Fases 1–3 concluídas
- **Ajustes manuais por breakpoint**: breakpoints configuráveis por projeto (até / a partir de uma largura, largura de edição), padrão desktop-first para designs largos e mobile-first para designs estreitos. No modo breakpoint o canvas mostra a tela na largura do breakpoint; mover, redimensionar, ocultar e mudar o tamanho da fonte gravam ajustes daquele breakpoint sem alterar a base; demais propriedades continuam compartilhadas. Indicação e "Limpar ajustes" por elemento. Exportado como `@media` (HTML/React) e variantes `max-[..]:`/`min-[..]:` (Tailwind), na mesma ordem de cascata usada pela pré-visualização.
- **Rotação**: campo R° e alça de giro no canvas (Shift = passos de 15°), seleção/alças rotacionadas, clique e redimensionamento corretos em elementos girados (o canto oposto fica fixo), miniatura e exportação (`transform: rotate`).
- **Componentes reutilizáveis**: criar componente a partir da seleção (Ctrl+Alt+K), mestre editável como um quadro próprio, instâncias que refletem o mestre e se redimensionam pelas constraints, textos sobrescritos por instância, desvincular instância, excluir componente sem perder conteúdo (instâncias viram elementos), proteção contra ciclos, componentes aninhados. Exportação gera a estrutura aninhada.
- **Componentes como asset**: "Salvar na Asset Library" gera um arquivo `.omnicomp` (com dependências e miniatura) e "Da biblioteca…" insere em qualquer projeto.
- **Transições animadas**: dissolver, deslizar (4 direções) e zoom, com duração, para navegação entre telas e para elementos que aparecem (mostrar/ocultar). Funcionam no protótipo e no código exportado (HTML via `sessionStorage` + keyframes, React via estado), respeitando "reduzir animações".
- **Biblioteca de ícones**: 1799 ícones Lucide (licença ISC) com busca, carregados sob demanda; renderizados como SVG que herda a cor do texto; exportados inline em HTML/JSX. Marcação gerada a partir de dados vetoriais com atributos em lista branca.
- **Estados**: hover, pressionado (`:active`) e foco (`:focus-within`), além de desabilitado (sem interações, opacidade reduzida, atributo `disabled` nativo).
- **Fontes da biblioteca no Web Design**: seletor de fonte lista as fontes da Asset Library (e permite importar), o canvas as carrega via FontFace e a exportação inclui os arquivos com `@font-face`.
- **Configurações aplicadas na hora**: intervalo de versão automática e atraso do salvamento automático passam a valer imediatamente no projeto aberto (antes só no próximo projeto).

### ✅ Fase 6 (parte) — Login e sincronização em nuvem (Supabase)
- **Login** por e-mail e senha: criar conta (com confirmação de e-mail quando o projeto exige), entrar, sair (dados locais preservados), esqueci a senha (link por e-mail → definir nova senha no app), reenviar confirmação. Mensagens de erro claras em português.
- **Configuração** pela tela "Conta e nuvem" (Project URL + chave pública) ou no build (`.env`). Chaves secretas (`service_role`, `sb_secret_`) são recusadas.
- **Sincronização** de projetos, versões, assets (com os arquivos) e pastas da biblioteca:
  1. identifica alterações locais (hash do conteúdo vs. último estado acordado, sem depender de rastrear cada escrita);
  2. compara com as revisões da nuvem;
  3. envia/baixa com escrita condicional por revisão;
  4. identifica conflitos (edição dupla, exclusão × edição, criação dupla);
  5. nunca sobrescreve em silêncio;
  6. resolução manual: manter deste dispositivo / da nuvem (com ponto de restauração da versão local) / ambos;
  7. relatório da sincronização concluída (enviados, recebidos, exclusões, conflitos, erros).
- Exclusões propagadas por lápides; registros grandes (> 2 MB) e arquivos no Storage, endereçados por SHA-256 e com integridade verificada no download; dados vindos da nuvem são validados antes de gravar.
- Automática (ao entrar, por intervalo configurável, após alterações, ao voltar online, ao reabrir) e manual; funciona offline e acumula pendências.
- Consentimento antes de enviar os dados locais para uma conta pela primeira vez neste dispositivo; contas isoladas.
- Editor aberto grava antes de sincronizar e recarrega quando o projeto muda pela nuvem.
- Indicadores na barra lateral (sincronizado, pendências, conflitos, offline, erro) e local de armazenamento "Local + nuvem" nos detalhes do projeto.
- Script SQL do Supabase (`supabase/migrations/0001_omnidesign_sync.sql`) com RLS, gatilho de revisão, sem exclusão física, bucket privado com arquivos imutáveis. Guia em `docs/CLOUD_SETUP.md`.

### ✅ Fase 4 — 3D Design Studio
- **Viewport** em tempo real (Three.js + React Three Fiber + Drei, carregado sob demanda): órbita, pan, zoom, perspectiva/ortográfica, vistas (frente, direita, topo), grid, eixos e widget de orientação, seleção por clique (Shift soma), gizmo de mover/girar/escalar (W/E/R) em eixos globais ou locais com snap, modos Wireframe / Sólido / Material.
- **Objetos**: cubo, esfera, cilindro, cone, plano, toro (parâmetros editáveis) e malhas próprias; duplicar, agrupar/desagrupar (mantendo a posição no mundo), hierarquia (mover para dentro de grupos), unir malhas, separar seleção, excluir, alinhar (origem/mín/centro/máx), apoiar no chão, espelhar, aplicar transformação. Objetos novos procuram espaço livre.
- **Modelagem** (malha poligonal própria, operações puras e testadas): modo objeto/edição (Tab), seleção de vértices/arestas/faces (1/2/3, A, Shift), mover/girar/escalar a seleção com gizmo, extrudar (região, com paredes e orientação preservadas), inset, bevel de faces, loop cut em anéis de quads, subdivisão Catmull–Clark ou plana, mesclar vértices próximos, inverter normais, excluir.
- **Modificadores não destrutivos**: subdivisão (até 3 níveis, suave ou plana) e espelhamento X/Y/Z com solda da costura; podem ser aplicados na malha.
- **Materiais PBR**: cor base, metálico, rugosidade, opacidade, emissivo, mapas de cor, normal, rugosidade, metálico, AO, emissivo e alpha vindos da Asset Library; repetição, deslocamento e rotação de textura; dupla face. **UV** por projeção (caixa, planar XY/XZ/YZ, esférica, cilíndrica).
- **Iluminação**: direcional, pontual, spot, área e hemisférica; intensidade, cor ou temperatura de cor (Kelvin), alcance, ângulo e suavidade; sombras configuráveis (liga/desliga, qualidade, suavidade); ambiente procedural (estúdio, ar livre, noite) ou **HDRI** (.hdr da biblioteca), fundo em cor, ambiente ou transparente.
- **Importação** pela Asset Library: GLB, GLTF (com .bin/texturas externas resolvidas pelo nome na biblioteca e erro claro se faltarem), OBJ + MTL (materiais e texturas pelo nome), FBX (texturas embutidas ou da biblioteca), STL. Miniatura 3D gerada ao importar na biblioteca.
- **Exportação**: GLB e GLTF (geometria, hierarquia, transformações, materiais, texturas e luzes), OBJ, STL, PNG da vista (1× ou 2×, fundo transparente opcional); exportar tudo ou só a seleção.
- **Apresentação**: tela limpa com rotação automática, tela cheia e captura de imagem.
- Desfazer/refazer, salvamento automático, versões, miniatura do projeto, sincronização em nuvem e pacotes de projeto (texturas, modelos e HDRI referenciados como `asset:<id>`).

### ✅ Publicação
- GitHub Pages via GitHub Actions (`.github/workflows/pages.yml`): testes + build no subcaminho `/OminiDesignStudio/` + deploy a cada push. Supabase do projeto configurado no build.
- App preparado para subcaminho: rotas (`basename`), service worker e manifest com escopo relativo, ícones, links de e-mail do Supabase apontando para `<base>/account`, `404.html` para links diretos.
- Verificado com um servidor que simula o Pages (`e2e/pages-server.mjs`): suítes smoke, assets e avançada passando; tela de conta com Supabase pré-configurado; service worker no escopo correto.

## Fases em andamento
Nenhuma. Próxima: **Fase 5 — Game Design Studio**.

## Funcionalidades pendentes (conhecidas)
Fase 4 (3D) — ainda não implementado:
- Bevel de **arestas** (o bevel atual é de faces: inset + altura) e editor de UV (desdobramento manual); hoje o UV é por projeção.
- Transformar vários objetos de uma vez pelo gizmo (hoje: um objeto por vez; alinhar/espelhar/agrupar funcionam em lote).
- WebGPU (o viewport usa WebGL) e física (Rapier, prevista junto ao Game Design Studio).
- Salvar materiais como assets da biblioteca (prefabs dependem da Fase 5).
- Loop cut testado em testes unitários; no navegador depende de clicar exatamente na aresta (sem teste automatizado de clique).

- Restante da Fase 6: sistema de plugins, otimizações e testes de integração adicionais.

Limitações conscientes:
- A interação "mostrar/ocultar" fica disponível apenas em telas (não dentro de componentes mestres), pois os alvos pertencem à tela.
- Ajustes por breakpoint valem para telas; dentro de componentes o layout segue as constraints (ao criar um componente, ajustes existentes são descartados após confirmação).

## Erros conhecidos
- Nenhum erro crítico conhecido.
- Tamanho de projeto exibido é aproximado (tamanho do JSON serializado).

## Testes realizados
- `npm test` — 100 testes (Vitest, IndexedDB simulado por fake-indexeddb):
  - histórico (commit/undo/redo/gestos/limite);
  - serviço de projetos (CRUD, favoritos, duplicação profunda, versões, restauração não destrutiva, poda de versões automáticas, export/import `.omni`, validação de arquivos corrompidos, exclusão em cascata);
  - operações do editor (mover, grupos, redimensionar grupos, exclusão em cascata, duplicação com remapeamento, ordem Z, alinhar/distribuir, smart snap, telas, normalização de dados corrompidos);
  - layout responsivo e exportadores (HTML escapado e sem URLs inseguras, React, Tailwind, ZIP);
  - store do editor (persistência, undo/redo, gesto único, copiar/colar, recuperação após reinício);
  - Asset Library (validação por conteúdo de todos os formatos, limites, deduplicação, duplicação com bytes compartilhados e coleta de lixo, tags/filtros/busca, pastas sem perda de conteúdo, vínculo e desvinculação ao excluir projeto, exportação/importação ZIP);
  - geometria (rotação, AABB, clique em elementos girados, redimensionamento girado com canto fixo, equivalência entre constraints numéricas e CSS);
  - breakpoints (ordem de cascata, projeção memorizada, gravação de ajustes sem alterar a base, visibilidade, fonte, limpeza, store com desfazer);
  - componentes (criação a partir da seleção, ciclos, desvincular com textos sobrescritos, exclusão sem perda, normalização, publicação/leitura na biblioteca);
  - exportação avançada (rotação, `:active`, `:focus-within`, desabilitado, ícones SVG, `@media` na ordem correta, instâncias aninhadas, transições, `@font-face`, variantes Tailwind);
  - sincronização (10 cenários com dois dispositivos: envio/recebimento, edições sequenciais, campos locais sem tráfego, conflito e as três resoluções, exclusões e exclusão × edição, assets com verificação de integridade, isolamento de contas, rejeição de dados inválidos);
  - adaptador Supabase (filtros e paginação, escrita condicional, duplicidade, registros grandes no Storage, integridade, arquivos existentes/ausentes, erros) e validação de chaves;
  - malha poligonal 3D (primitivas fechadas e orientadas, volumes, extrusão de face e de região, inset, bevel, Catmull–Clark, loop cut em caixa e cilindro, mesclar, excluir, inverter, espelhar com solda);
  - cena 3D (grupos preservando transformações do mundo, ciclos, duplicar, alinhar, apoiar no chão, aplicar transformação, unir e separar, materiais, referências de assets para pacotes, normalização de dados corrompidos);
  - exportação 3D (hierarquia e seleção, OBJ/STL reimportados com a mesma geometria, glTF com malhas, materiais e luzes);
  - pacotes de projeto (busca/reescrita de referências, ida e volta em biblioteca vazia com remapeamento inclusive nas versões, reaproveitamento, dependências ausentes, ZIP inválido).
- `npm run test:e2e` — fluxo completo no navegador (Chromium): criar projeto por modelo, inserir, arrastar, desfazer/refazer, editar texto, protótipo com navegação e modal, troca de dispositivo, exportação, persistência após recarregar, dashboard, indicador offline, layout mobile sem rolagem horizontal, ausência de erros no console. ✅
- `e2e/assets.mjs` — importação (válidos, inválido rejeitado, duplicado reaproveitado), renomear/tag/filtro, pastas, imagem da biblioteca no canvas, exportação HTML com o arquivo do asset, aba do projeto, exportação e reimportação do pacote do projeto. ✅
- `e2e/advanced.mjs` — rotação (campo e alça), estado pressionado, desabilitado, ícone da biblioteca, transição animada, ajuste por breakpoint preservando a base e aplicado na pré-visualização de celular, criação de componente e propagação do mestre para instâncias, componente salvo na biblioteca, fonte da biblioteca, CSS exportado. ✅
- `npm run test:sql` — script do Supabase aplicado duas vezes num PostgreSQL 16 real: RLS por usuário (registros e arquivos), anônimo sem acesso, revisão +1, revisão inicial 1, hash válido, sem exclusão física, referência de payload restrita ao próprio usuário, arquivos imutáveis. ✅
- `e2e/studio3d.mjs` — no navegador com WebGL: render da cena verificado por pixels (cor do material PBR aplicada, sombra presente/ausente), mover e desfazer, adicionar esfera e luz, modo edição com inset/extrusão/subdivisão conferidos pela contagem da malha, desfazer, modificador sem alterar a base, exportação GLB/STL/OBJ/PNG verificada nos arquivos, reimportação do GLB, apresentação, persistência após recarregar, miniatura 3D na biblioteca. ✅
- **Validado no projeto Supabase real** (14/11/2026): script aplicado, checagem de segurança do Supabase sem problemas de banco, e `e2e/cloud.mjs` em modo real (`SUPABASE_URL`/`SUPABASE_ANON_KEY`) passou de ponta a ponta — cadastro, login, dois dispositivos, edição nos dois sentidos, asset com arquivo no Storage, offline, conflito, "manter ambos", sair — além do isolamento entre contas (outra conta não lê, não grava em nome de outro, não altera e não baixa arquivos; nem o dono apaga fisicamente). ✅
- `e2e/cloud.mjs` (modo local) — supabase-js real contra servidor local que imita o Supabase: configuração pela interface (chave secreta recusada), cadastro, consentimento, sincronização, senha errada, segundo dispositivo, edição nos dois sentidos, asset com arquivo, offline com pendências, conflito, "manter ambos", sair preservando dados. ✅
- Verificação manual: os projetos React e React+Tailwind exportados passam em `tsc` e `vite build` e executam o protótipo (navegação + modal) corretamente.

## Próximas tarefas
1. Antes de abrir para outras pessoas: SMTP próprio no Supabase (o envio padrão só entrega para a equipe do projeto e tem limite por hora) e religar "Confirm email".
2. Fase 5 — Game Design Studio (GDD, editor 2D, tilemaps, spritesheets, lógica por nodes).
