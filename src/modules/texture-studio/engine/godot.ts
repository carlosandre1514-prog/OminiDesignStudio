/**
 * Godot 4 export: a StandardMaterial3D resource (.tres) referencing the exported PNG maps.
 * Godot uses OpenGL-style normal maps (Y+), metallic/roughness/AO read from the red channel.
 */

export interface GodotFiles {
  albedo: string;
  normal: string;
  roughness: string;
  metallic: string;
  ao: string;
  height?: string;
  emission?: string;
}

export interface GodotOptions {
  name: string;
  /** res:// folder the files are copied to. */
  folder: string;
  files: GodotFiles;
  skin?: boolean;
  normalStrength?: number;
}

const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function godotMaterialTres(o: GodotOptions): string {
  const entries = Object.entries(o.files).filter(([, f]) => !!f) as [keyof GodotFiles, string][];
  const id = (k: string) => `${k}_tex`;
  const res = (f: string) => `res://${o.folder}/${f}`;
  const lines: string[] = [];
  lines.push(`[gd_resource type="StandardMaterial3D" load_steps=${entries.length + 1} format=3]`, '');
  for (const [k, f] of entries) lines.push(`[ext_resource type="Texture2D" path=${q(res(f))} id=${q(id(k))}]`);
  lines.push('', '[resource]', `resource_name = ${q(o.name)}`);
  const has = (k: keyof GodotFiles) => entries.some(([e]) => e === k);
  lines.push(`albedo_texture = ExtResource(${q(id('albedo'))})`);
  lines.push('metallic = 1.0', `metallic_texture = ExtResource(${q(id('metallic'))})`, 'metallic_texture_channel = 0');
  lines.push('roughness = 1.0', `roughness_texture = ExtResource(${q(id('roughness'))})`, 'roughness_texture_channel = 0');
  lines.push('normal_enabled = true', `normal_scale = ${(o.normalStrength ?? 1).toFixed(2)}`, `normal_texture = ExtResource(${q(id('normal'))})`);
  lines.push('ao_enabled = true', `ao_texture = ExtResource(${q(id('ao'))})`, 'ao_texture_channel = 0');
  if (has('emission')) lines.push('emission_enabled = true', 'emission = Color(1, 1, 1, 1)', `emission_texture = ExtResource(${q(id('emission'))})`);
  if (has('height')) lines.push('heightmap_enabled = false', 'heightmap_scale = 2.0', `heightmap_texture = ExtResource(${q(id('height'))})`);
  if (o.skin) lines.push('subsurf_scatter_enabled = true', 'subsurf_scatter_strength = 0.35', 'subsurf_scatter_skin_mode = true');
  lines.push('');
  return lines.join('\n');
}

export const GODOT_README = (folder: string, hasModel: boolean) =>
  `Pacote para Godot 4 gerado no OmniDesign Studio.

1. Copie a pasta "${folder}" para dentro do seu projeto Godot (res://${folder}).
2. O Godot importa as texturas sozinho.
${hasModel ? `3. Arraste o arquivo .glb para a cena: ele já vem com a pintura aplicada (UV atlas).
4. Para usar o material editável, selecione o MeshInstance3D e em "Surface Material Override" carregue o arquivo .tres.` : '3. Selecione o seu MeshInstance3D e em "Surface Material Override" carregue o arquivo .tres.'}

Mapas: cor (albedo), normal (OpenGL, padrão do Godot), rugosidade, metálico, oclusão (AO)${hasModel ? '' : ', altura'} e emissivo.
`;
