import { create } from 'zustand';

export type Tool = 'select' | 'hand';

interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  tool: Tool;
  showRulers: boolean;
  /** Smart alignment lines currently displayed (world coordinates). */
  snapX: number[];
  snapY: number[];
  editingTextId: string | null;
  setView(v: Partial<Pick<ViewState, 'zoom' | 'panX' | 'panY'>>): void;
  setTool(t: Tool): void;
  toggleRulers(): void;
  setSnapLines(x: number[], y: number[]): void;
  setEditingText(id: string | null): void;
  zoomAt(factor: number, cx: number, cy: number): void;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 16;

export const useView = create<ViewState>((set, get) => ({
  zoom: 1,
  panX: 40,
  panY: 40,
  tool: 'select',
  showRulers: true,
  snapX: [],
  snapY: [],
  editingTextId: null,
  setView: (v) => set(v),
  setTool: (tool) => set({ tool }),
  toggleRulers: () => set({ showRulers: !get().showRulers }),
  setSnapLines: (snapX, snapY) => set({ snapX, snapY }),
  setEditingText: (editingTextId) => set({ editingTextId }),
  /** Zoom keeping the screen point (cx, cy) fixed. */
  zoomAt(factor, cx, cy) {
    const { zoom, panX, panY } = get();
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    const k = next / zoom;
    set({ zoom: next, panX: cx - (cx - panX) * k, panY: cy - (cy - panY) * k });
  },
}));
