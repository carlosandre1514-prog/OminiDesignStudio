# Arsenal 3D

Aplicação dentro do OmniDesign Studio (rota `/arsenal`, PWA, funciona offline) para **gerar, inspecionar e personalizar armas 3D hard-surface**, com três layouts no mesmo código: **Computador**, **Celular (toque)** e **Smart TV (controle remoto / D-pad)**.

> Tudo roda no aparelho. Não há chamada a API nem IA externa: o “texto → 3D” é um interpretador de vocabulário técnico que dirige o gerador procedural, e o “imagem → 3D” reconstrói o sólido pela silhueta da foto.

## Estrutura

```
src/modules/arsenal/
├── ArsenalApp.tsx              # layouts PC / celular / TV, abas, viewport com modo câmera, teclas Voltar
├── store.ts                    # estado (Zustand): modelo, peças, materiais, inspector, status, FPS/polígonos
├── canvas/
│   ├── ArsenalCanvas.tsx       # Canvas R3F: iluminação de estúdio PBR, sombras, câmera (enquadrar, órbita por controle), FPS
│   ├── WeaponModel.tsx         # sub-malhas, vista explodida animada, ocultar/isolar, seleção por clique
│   └── useWeaponMaterials.ts   # materiais PBR por slot: texturas procedurais, camuflagem, desgaste de bordas
├── components/
│   ├── ui.tsx                  # Btn, Slider, Segmented, Toggle, Section — tamanhos por perfil + foco forte p/ TV
│   ├── Header.tsx              # título, status da geração, FPS, polígonos, troca de layout
│   ├── PromptPanel.tsx         # Texto → 3D, Imagem → 3D, exemplos, interpretação; seletor de tipo e parâmetros
│   ├── PartsInspector.tsx      # sub-malhas: mostrar/ocultar, isolar, selecionar, vista explodida
│   ├── MaterialsPanel.tsx      # Roughness, Metallic, Edge Wear, camuflagem/cerakote e acabamentos
│   └── ExportBar.tsx           # .GLB, .GLTF, .OBJ e “Abrir no Estúdio 3D”
├── hooks/
│   ├── useDeviceProfile.ts     # detecção PC / celular / TV (user agent, ponteiro, largura) + escolha manual
│   ├── spatialNav.ts           # navegação espacial pura (testável): melhor alvo por direção
│   └── useSpatialNavigation.ts # setas, OK/Enter, Voltar (Escape, Backspace, XF86Back, GoBack, 10009, 461)
└── lib/
    ├── promptParser.ts         # texto → tipo, parâmetros, acabamento, camuflagem (PT-BR e EN)
    ├── silhouette.ts           # imagem → máscara (alfa ou cor de fundo + Otsu) → marching squares → Douglas–Peucker → extrusão com aberturas
    ├── surface.ts              # atributos de distância às arestas + shader de desgaste; camuflagens procedurais
    └── exportWeapon.ts         # cena limpa p/ GLTFExporter/OBJExporter; envio ao Estúdio 3D
```

A geometria e as texturas base vêm do gerador do Estúdio 3D (`src/modules/studio-3d/weapons` e `mesh/builders.ts`): 20 tipos de armas em 4 categorias, malhas fechadas com dimensões reais.

## Controles

| | PC | Celular | Smart TV |
|---|---|---|---|
| Girar | arrastar | arrastar | OK no viewport → setas |
| Zoom | roda | pinça | `+` / `−` (ou Channel ▲/▼, PageUp/Down) |
| Mover | botão direito | dois dedos | — |
| Enquadrar | botão ⛶ | botão ⛶ | `0` no modo câmera |
| Selecionar peça | clique | toque | lista de peças |
| Interface | mouse / Tab / setas | toque | setas, OK, Voltar |

Na TV, o foco recebe borda ciano brilhante e escala 1,04. Setas ←/→ ajustam o slider focado; ↑/↓ saem dele. Voltar leva da opção para a aba e da aba para o viewport.

## Desgaste de bordas

Para cada triângulo são gravadas as alturas até as arestas “duras” do polígono (ângulo diedro > 30°). No shader, distância à aresta = coordenada baricêntrica × altura, em metros. Assim a faixa gasta tem largura real (até 3,5 mm) em qualquer tamanho de face, com ruído para parecer lascado. Revela aço (peças de metal), plástico claro (polímero) ou madeira clara.

## Limites conhecidos

- O texto é interpretado por vocabulário: entende tipos, calibres, acessórios, cores, camuflagens e desgaste, mas não inventa formas novas. Palavras não reconhecidas aparecem na interface.
- Imagem → 3D gera um sólido extrudado da silhueta (foto de lado, fundo liso ou PNG transparente). Não reconstrói volumes escondidos.
- O desgaste de bordas é um efeito de shader do visualizador; nas exportações seguem as texturas PBR (com arranhões e sujeira) sem as bordas gastas.
