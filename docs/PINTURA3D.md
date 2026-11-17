# Pintura 3D (texturização direto no modelo)

Ferramenta de texturização no estilo dos programas profissionais (camadas + pincéis + materiais PBR + desgaste automático), dentro do OmniDesign Studio, 100% no navegador.

## Fluxo

1. **Estúdio 3D**: selecione o objeto (ou nada, para pintar todas as malhas visíveis menos o chão) e toque em **🖌 Pintar em 3D**.
   - Modelos importados (GLB/OBJ/FBX…) são convertidos em malha para receber a pintura.
   - Armas do Arsenal: use "Abrir no Estúdio 3D" e depois "Pintar em 3D".
2. O **Estúdio de Texturas** abre com o modelo:
   - **UV automática** (atlas sem sobreposição, densidade de texels uniforme);
   - **leitura da malha**: quinas vivas, cantos internos e curvatura da superfície.
3. Pinte com o pincel:
   - **1 dedo / botão esquerdo** pinta; **2 dedos / botão direito** giram a câmera; a roda dá zoom.
   - O anel laranja mostra o tamanho do pincel na superfície.
4. **Aplicar no modelo**: gera os mapas na resolução final, salva na Asset Library, cria o material "Pintura 3D — …" e grava a UV atlas nos objetos do Estúdio 3D.
5. **Exportar → Godot 4**: ZIP com:
   - texturas (albedo, normal OpenGL, rugosidade, metálico, AO, altura, emissivo);
   - material `StandardMaterial3D` (`.tres`);
   - o modelo pintado em `.glb`;
   - um LEIA-ME com os passos.

## Pincéis

Formatos: redondo, quadrado, spray, grunge e pontilhado. Ajustes:

- **Tamanho**: em relação ao modelo; atalhos `[` e `]`.
- **Dureza**.
- **Opacidade**: teto do traço.
- **Fluxo**: acúmulo por toque.
- **Espaçamento**.
- **Borracha**.
- **Cor da tinta**.

O pincel 3D trabalha no espaço do modelo: cada toque pinta os pontos da superfície dentro do raio, por isso o traço atravessa as emendas da UV sem cortar nem esticar. Ele não pinta através de partes finas, porque só pinta superfícies voltadas para o mesmo lado.

Cada camada de pintura é uma **máscara**: a cor, a rugosidade, o metálico e o relevo vêm do conteúdo da camada. Por isso dá para "pintar material" (ex.: pintar ferrugem, cicatriz ou oleosidade).

## Desgaste automático

A máscara **Curvatura** usa a geometria real quando há um modelo:

- **Bordas / quinas**: distância às arestas vivas convexas (desgaste de pintura, metal exposto).
- **Cavidades**: cantos internos e regiões côncavas (poeira, sujeira). Também escurecem a oclusão (AO).
- **Quebrar em lascas**: um grunge recorta o desgaste em lascas irregulares.

Os padrões procedurais repetem pelo modelo em escala real: "Escala dos padrões no modelo" começa em cerca de 30 cm por repetição.

## Materiais

- **Armas**: "Arma: cerakote + quinas gastas (modelo 3D)", mais aço escovado, alumínio anodizado, polímero, madeira, aço enferrujado, camuflagem, entre outros.
- **Pele e personagens**: pele clara (sardas), morena, negra e envelhecida. Incluem poros e microrrugas, vermelhidão, sardas/pintas, e camadas prontas para pintar oleosidade, cicatrizes e sujeira. O tipo de superfície "Pele" liga a translucidez (SSS aproximada na prévia, `subsurf_scatter` real no Godot).
- **Animais**: escamas de réptil, couro de crocodilo, escamas de peixe/cobra, pelo de tigre (listras), pelo de onça/leopardo (rosetas), pelo de lobo, penas, chifre/casco.

Novos geradores (grupo "Orgânicos"): pele (poros), sardas/pintas, rugas, escamas (réptil/peixe), pelos, listras animais, rosetas, penas, chifre.

## Limites atuais

- **Pelos**: são uma *textura* de pelos (cor, relevo e rugosidade), não fios 3D.
- **Emendas da UV**: padrões procedurais podem mostrar emenda entre ilhas do atlas. A pintura com pincel não tem esse problema.
- **Resolução**: a pintura é feita a 1024 px no atlas. A exportação vai até 2048 px.

## Código

- `studio-3d/mesh/uvAtlas.ts`: UV atlas automática.
- `texture-studio/engine/meshBake.ts`: leitura da malha (posição/normal por texel, distância às quinas, curvatura, cobertura).
- `texture-studio/engine/paint3d.ts`: pontas de pincel e pincel 3D com índice espacial.
- `texture-studio/engine/target.ts`: carrega o modelo, aplica no Estúdio 3D, exporta `.glb`.
- `texture-studio/engine/godot.ts`: material `.tres` do Godot 4.
- `studio-3d/paint3d.ts`: botão "Pintar em 3D" (seleção, conversão de modelos importados, projeto de pintura).
- Testes: `engine/paint3d.test.ts` e e2e `e2e/paint3d.mjs`.
