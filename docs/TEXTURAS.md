# Estúdio de Texturas

Módulo `texture-studio` (abre em qualquer projeto; atalho “▦ Estúdio de Texturas” no Dashboard e “Criar” no Arsenal). Cria **materiais PBR por camadas**, no estilo dos programas profissionais de texturização, inteiramente no navegador. O cálculo roda num **Web Worker**, então a interface não trava (inclusive no celular).

## Como funciona

Uma textura é uma **pilha de camadas** (de baixo para cima). Cada camada tem:

- **Conteúdo**: o que ela pinta.
  - Cor sólida, gradiente de até 6 cores (contínuo ou em faixas) ou imagem da biblioteca.
  - Rugosidade A→B, metálico A→B, relevo (altura) e emissivo.
  - Tudo pode ser modulado por um **padrão procedural**.
- **Máscara**: onde ela aparece.
  - Padrão procedural ou pintura com pincel (2D ou direto no modelo 3D).
  - Texto/decalque (gravações, números de série, logotipos).
  - Imagem da biblioteca.
  - **Curvatura**: bordas/quinas para desgaste, cavidades para sujeira, calculada do relevo das camadas de baixo.
  - **Altura**: picos/vales.
- **Mesclagem**: modo de cor (normal, multiplicar, tela, sobrepor, adicionar, luz suave, escurecer, clarear), modo de altura (substituir, somar, subtrair, máx., mín.), opacidade e canais afetados.

### 22 geradores sem emenda (tileable)

- **Ruídos:** ruído fractal, células (Voronoi).
- **Desgaste:** grunge, manchas, arranhões, ferrugem, rachaduras.
- **Superfícies:** metal escovado, madeira, couro, tecido, camuflagem (woodland/digital/tiger).
- **Industriais:** fibra de carbono, recartilhado, chapa xadrez, chapa perfurada.
- **Geométricos:** hexágonos, placas/painéis, listras, xadrez, pontos/rebites, gradiente.

### 16 materiais prontos (smart materials)

Aço escovado, cerakote preto com desgaste, alumínio anodizado, polímero texturizado, fibra de carbono, nogueira envernizada, couro, aço recartilhado, latão envelhecido, aço enferrujado, camuflagem woodland, chapa xadrez, painéis sci-fi, escudo de energia, tecido tático (cordura) e aço damasco. Todos ficam editáveis.

## Saídas

Cor base, normal (OpenGL ou DirectX), rugosidade, metálico, altura, oclusão (AO), emissivo e **ORM** (R = AO, G = rugosidade, B = metálico, padrão glTF), em 512, 1024 ou 2048 px.

- **Baixar ZIP**: todos os mapas mais o `.omnitex.json` da pilha.
- **Salvar na biblioteca**: os mapas ficam disponíveis nos materiais do Estúdio 3D.

Prévia 3D em esfera, cubo, cilindro, plano ou fuzil, com relevo real (deslocamento). Prévia 2D por mapa, com repetição 2×2 para conferir emendas.

## Pintura 3D no modelo

Para pintar direto num objeto do Estúdio 3D (UV automática, pincel 3D, desgaste pela geometria real, pele/animais e exportação para Godot 4), veja `docs/PINTURA3D.md`.

## No Arsenal

Em **Materiais → Texturas do Estúdio**, escolha uma textura para cada parte da arma (receptores, polímero, aço, empunhadura…) e a escala real (cm por repetição). Ela entra no visualizador, nas exportações GLB/GLTF e no “Abrir no Estúdio 3D” (com mapas de cor, rugosidade, metálico, normal e AO).

## Código

`src/modules/texture-studio/`:

- `engine/noise.ts`: ruídos periódicos.
- `engine/generators.ts`: biblioteca de padrões.
- `engine/compose.ts`: pilha de camadas → mapas, normal por Sobel, AO por cavidade, máscaras de curvatura.
- `engine/presets.ts`: materiais prontos.
- `engine/runner.ts` e `engine/worker.ts`: worker, pintura, texto, imagens.
- `store.ts`: histórico, salvamento e sincronização.
- `components/*`: camadas, propriedades, prévias 2D/3D e exportação.

Testes: `engine/engine.test.ts` (31 casos, inclusive emendas de todos os geradores) e e2e `e2e/textures.mjs`.
