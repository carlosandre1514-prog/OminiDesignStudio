# Arquitetura e decisões técnicas

## Princípios
- **Um banco, um modelo de projeto.** Todos os módulos persistem no mesmo IndexedDB (`src/core/db/database.ts`). Um projeto = `ProjectMeta` (metadados) + `ProjectDocument` (`modules: Record<moduleId, data>`). Cada módulo é dono da sua chave em `modules`, o que permite que Web Design, 3D, Game Design e Assets compartilhem o mesmo projeto, versões e histórico.
- **Módulos registrados, carregados sob demanda.** `registerModule()` (`src/core/modules/registry.ts`) recebe metadados + um editor `React.lazy`. O bundle de cada editor só é baixado ao abrir. Módulos ainda não entregues são registrados como `planned` e aparecem desabilitados com a fase indicada — nunca como botões falsos. O mesmo ponto de entrada será usado pelo sistema de plugins (Fase 6).
- **Lógica pura separada da UI.** Cada módulo tem modelo (`model.ts`), operações puras e imutáveis (`ops.ts`), exportadores e store. Isso torna as operações testáveis sem DOM.
- **Desfazer/refazer por snapshots imutáveis** (`src/core/history/history.ts`). Gestos contínuos (arrastar, redimensionar, color picker) usam `live()` + `endGesture()` para gerar um único passo de histórico.

## Persistência e recuperação
- Salvamento automático com debounce configurável (`autosaveDelayMs`) + flush em `beforeunload`/`visibilitychange` e ao sair do editor.
- Pontos de restauração manuais e automáticos (a cada N minutos de edição, máx. 20 automáticos por projeto).
- Restaurar uma versão **sempre** cria antes um backup do estado atual (não destrutivo).
- Dados carregados passam por `normalizeDoc()`, que descarta partes corrompidas em vez de quebrar o editor.
- Error boundaries isolam falhas de um módulo; o projeto salvo não é afetado.
- Arquivos `.omni` (JSON versionado com `schemaVersion`) são validados antes da importação; importar sempre cria um projeto novo (sem sobrescrita silenciosa).

## Web & App Design
- **Constraints de responsividade** (`left/right/center/stretch/scale` × `top/bottom/center/stretch/scale`) são convertidas em CSS por `boxCss()` (`layout.ts`). A mesma função alimenta a pré-visualização e todos os exportadores, garantindo que o protótipo e o código exportado tenham o mesmo comportamento.
- Grupos são nós organizacionais (bounding box recalculada por `refreshGroups`); na exportação são achatados.
- Interações de protótipo: navegar para tela, mostrar/ocultar elemento (modais/menus) e abrir link externo (somente http/https).
- Exportação: HTML+CSS (uma página por tela + `app.js` de interações), React+TS (projeto Vite) e React+TS+Tailwind (classes com propriedades arbitrárias, ex. `[left:24px]`). Todos os textos são escapados e URLs/cores passam por sanitização.

## Segurança
- Nenhum código importado é executado. Imagens SVG são incorporadas como `<img>` (data URL), nunca como markup inline.
- Limite configurável de tamanho de importação.
- `safeUrl` bloqueia esquemas como `javascript:`; `safeColor` restringe valores de cor; `escapeHtml` em toda geração de HTML/JSX.

## Offline
- Service worker (`public/sw.js`) faz cache do app shell e dos assets compilados; navegação offline cai no `index.html`.
- Indicador online/offline e de sincronização (atualmente "somente local": sincronização em nuvem é da Fase 6).
- `navigator.storage.persist()` é solicitado para evitar limpeza automática dos dados.

## Asset Library (Fase 3)
- **Endereçamento por conteúdo.** `assets` guarda metadados; `assetData` guarda os bytes indexados pelo SHA-256. Vários assets (duplicatas, mesmo arquivo importado duas vezes, mesmo arquivo em projetos diferentes) apontam para o mesmo conteúdo. A exclusão faz coleta de lixo do conteúdo sem referências.
- **ArrayBuffer em vez de Blob** no IndexedDB, por compatibilidade (Safari antigo e ambientes de teste).
- **Referências `asset:<id>`** dentro dos documentos dos módulos. A UI resolve para object URLs (cache em `assetUrls.ts`); exportadores substituem por caminhos de arquivo empacotados. Pacotes de projeto remapeiam ids ao importar (`projectPackage.ts`) e listam dependências ausentes.
- **Validação dupla**: extensão suportada + assinatura/estrutura do conteúdo (`formats.ts`). Nada importado é executado; SVG só é exibido via `<img>`.

## Breakpoints, componentes e renderização compartilhada
- **Breakpoints por projeção**: `projectScreen()` gera (e memoriza por identidade) a tela vista na largura de um breakpoint; o store aplica as edições sobre essa projeção e `writeBack()` converte diferenças de geometria/visibilidade/fonte em `overrides[bp]`, mantendo o resto na base. Assim todas as ferramentas do canvas funcionam sem conhecer breakpoints.
- **Uma regra de layout, duas formas**: `resolveConstraintBox()` (números, usada no canvas/pré-visualização/instâncias) espelha `boxCss()` (CSS exportado); há teste de equivalência. A cascata de breakpoints (`cascadeOrder`) é a mesma nos dois lados.
- **Árvore de renderização** (`export/tree.ts`): exportadores HTML, React e Tailwind consomem os mesmos nós (CSS base, estados, media queries, filhos de instância), evitando divergências.
- **Componentes** são quadros (`WDComponent` = mesma forma de uma tela) guardados em `doc.components`; instâncias referenciam o mestre por id e renderizam os filhos pelas constraints. Ícones são dados vetoriais Lucide carregados sob demanda.

## Nuvem (Supabase)
- **Motor independente do backend** (`src/core/cloud/engine.ts`): compara local × último estado acordado (`syncState`, por conta) × nuvem, usando hash do conteúdo e revisões. O backend é uma interface (`RemoteStore`) — implementada por `SupabaseRemote` e, nos testes, por um armazenamento em memória com as mesmas regras.
- **Adaptadores locais** (`kinds.ts`) leem/gravam cada tipo (projeto, versão, asset, pasta) recebendo a instância do banco, o que permite simular dois dispositivos nos testes. Todo dado recebido é validado.
- **Segurança no servidor**: RLS por `owner = auth.uid()`, gatilho que exige revisão +1, sem DELETE, Storage só com criação em caminhos endereçados por hash do próprio usuário.
- **Integração com editores** por ganchos (`hooks.ts`): gravar antes de sincronizar; recarregar o projeto aberto quando ele muda pela nuvem.
- O SDK do Supabase é carregado sob demanda, só quando a nuvem está configurada.

## 3D Design Studio (Fase 4)
- **Malha poligonal própria** (`studio-3d/mesh/polyMesh.ts`): vértices + faces n-gon, operações puras (extrusão de região, inset, bevel, Catmull–Clark, loop cut, espelhar com solda). Testável sem navegador; a geometria do Three.js é gerada a partir dela (`geometry.ts`), com normais planas/suaves, projeções de UV e mapa triângulo→face para seleção no modo edição.
- **Primitivas paramétricas** viram malha editável ao entrar no modo edição; **modificadores** (espelho, subdivisão) são aplicados só na geração da geometria.
- **Uma fonte para viewport e exportação**: geometria (`objectGeometry`, memorizada por identidade) e materiais (`materials.ts`) são compartilhados pelo viewport (R3F) e pelo construtor de cena dos exportadores.
- **Assets por referência** (`asset:<id>`): modelos, texturas e HDRI vêm da Asset Library e entram nos pacotes de projeto. Dependências externas de GLTF/OBJ/FBX são resolvidas pelo nome do arquivo na biblioteca; ausências viram erro/aviso explícito.
- O módulo inteiro (Three.js incluso) é um chunk separado, carregado só ao abrir o 3D Studio.
