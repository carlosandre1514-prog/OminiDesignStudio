# IA no aparelho

O OmniDesign Studio roda modelos de IA **abertos, no próprio navegador**, com [ONNX Runtime Web](https://onnxruntime.ai/). Usa a GPU (WebGPU) quando o aparelho tem, e a CPU (WebAssembly) quando não tem. Não há servidor, chave de API nem custo por uso.

| Modelo | Uso | Licença | Download |
|---|---|---|---|
| U²-Netp | recorta o objeto do fundo da foto | Apache-2.0 | 4,6 MB |
| Depth Anything V2 (small) | estima a profundidade de cada pixel | Apache-2.0 | 50 MB (GPU, fp16) / 27 MB (CPU, int8) |

- Os modelos são baixados do Hugging Face **só na primeira vez** e ficam no Cache Storage do navegador. Depois funcionam offline.
- O service worker preserva esse cache entre versões do app.
- O motor (`ort-wasm-*.wasm`, 3–5 MB comprimido) só é carregado quando um recurso de IA é usado.

## Recursos

### Arsenal → Foto → 3D (IA)

Uma foto de lado (de preferência com fundo liso) vira um modelo 3D texturizado:

1. Recorte do objeto por IA (ou transparência do PNG / cor de fundo, sem IA).
2. Profundidade por IA (ou estimativa pelo contorno e pelo brilho, sem IA).
3. Sólido fechado em tamanho real: superfície frontal deslocada pela profundidade, verso espelhado, bordas arredondadas por transformada de distância, contorno suavizado (Taubin).
4. **A própria foto como textura** (cores estendidas além do contorno, sem halo do fundo), mais um mapa normal tirado da profundidade para os detalhes finos.

O modelo pode ser exportado (GLB/GLTF/OBJ) e aberto no Estúdio 3D com a textura no lugar. O modo antigo, "Silhueta extrudada", continua disponível.

### Estúdio de Texturas → Foto → Material (IA)

A foto de uma superfície real (metal, madeira, couro, tecido, pedra…) vira um material PBR editável:

1. Recorte quadrado e **tornar sem emenda** (fusão com cópia deslocada).
2. Relevo por IA de profundidade (ou pelo brilho), com o declive geral removido (passa-altas).
3. Camadas: foto (cor) + relevo + rugosidade guiada pelo relevo + sujeira nas cavidades.

Daí saem normal, AO, rugosidade e altura como em qualquer textura do estúdio.

## Limites honestos

- O Meshy usa modelos generativos enormes em servidores com GPU: inventa formas novas a partir de texto e reconstrói o verso do objeto. Aqui a reconstrução vem **de uma foto**. A frente fica fiel à foto, e o verso é espelhado (bom para vistas laterais de armas e objetos simétricos).
- Celulares sem WebGPU usam a CPU: o modelo de profundidade leva alguns segundos por foto.
- A qualidade depende da foto: de lado, bem iluminada, objeto inteiro no quadro.

## Código

- `src/core/ai/models.ts`: modelos (URLs, tamanhos, licenças).
- `src/core/ai/runtime.ts`: carregamento do ONNX Runtime (WebGPU/WASM), download com progresso, cache offline, sessões e reserva para a CPU.
- `src/core/ai/vision.ts`: pré-processamento (ImageNet, múltiplos de 14) e pós-processamento (recorte, profundidade).
- `src/modules/arsenal/lib/relief.ts`: profundidade + máscara → sólido estanque.
- `src/modules/arsenal/lib/photo3d.ts`: pipeline foto → 3D.
- `src/modules/texture-studio/engine/photoMaterial.ts`: foto → mapas sem emenda.

Testes: `relief.test.ts`, `photoMaterial.test.ts` e o e2e `e2e/ai.mjs`. O e2e serve modelos ONNX mínimos com as mesmas entradas e saídas dos reais (`e2e/fixtures/*.onnx`) para exercitar todo o caminho sem baixar os 30–55 MB.
