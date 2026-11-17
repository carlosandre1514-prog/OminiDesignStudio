import { lazy } from 'react';
import { registerModule } from '@/core/modules/registry';

registerModule({
  id: 'web-design',
  name: 'Web & App Design',
  description: 'Canvas de interfaces, componentes, responsividade, protótipos e exportação de código.',
  icon: '▣',
  phase: 2,
  status: 'available',
  defaultFor: ['web', 'app', 'mixed'],
  editor: lazy(() => import('./web-design/WebDesignStudio')),
});

registerModule({
  id: 'asset-library',
  name: 'Asset Library',
  description: 'Biblioteca universal de recursos com pastas, tags e importação.',
  icon: '◫',
  phase: 3,
  status: 'available',
  defaultFor: [],
  editor: lazy(() => import('./asset-library/AssetLibraryModule')),
});

registerModule({
  id: '3d-studio',
  name: '3D Design Studio',
  description: 'Viewport 3D, modelagem, materiais PBR, iluminação e importação/exportação 3D.',
  icon: '◈',
  phase: 4,
  status: 'available',
  defaultFor: ['3d'],
  editor: lazy(() => import('./studio-3d/Studio3D')),
});

registerModule({
  id: 'texture-studio',
  name: 'Estúdio de Texturas',
  description: 'Materiais PBR por camadas: padrões procedurais, máscaras, pintura, texto/decalques, desgaste e exportação de mapas.',
  icon: '▦',
  phase: 4,
  status: 'available',
  defaultFor: [],
  editor: lazy(() => import('./texture-studio/TextureStudio')),
});

registerModule({
  id: 'game-design',
  name: 'Game Design Studio',
  description: 'GDD, editor 2D, tilemaps, spritesheets e lógica visual por nodes.',
  icon: '◉',
  phase: 5,
  status: 'planned',
  defaultFor: ['game'],
});
