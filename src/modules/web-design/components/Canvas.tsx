import { useEffect, useRef, type PointerEvent as RPointerEvent } from 'react';
import { safeColor } from '@/core/utils/sanitize';
import { isEffectivelyVisible } from '../layout';
import type { WDElement, WDScreen } from '../model';
import * as ops from '../ops';
import { selectScreen, useWebDesign } from '../store';
import { useView } from '../viewStore';
import { absBox, ElementView } from './ElementView';
import { Rulers, RULER } from './Rulers';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const TEXT_TYPES = new Set(['text', 'button', 'icon', 'card', 'modal', 'navbar', 'input']);

type Drag =
  | { kind: 'pan'; sx: number; sy: number; px: number; py: number }
  | { kind: 'move'; wx: number; wy: number; ids: string[]; base: WDScreen; started: boolean }
  | { kind: 'resize'; handle: Handle; wx: number; wy: number; id: string; rect: ops.Rect; base: WDScreen }
  | { kind: 'marquee'; wx: number; wy: number; cx: number; cy: number; additive: boolean; initial: string[] }
  | { kind: 'guide'; axis: 'x' | 'y'; index: number; base: WDScreen };

export function Canvas() {
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const spaceDown = useRef(false);

  const screen = useWebDesign(selectScreen);
  const grid = useWebDesign((s) => s.history.present.grid);
  const selection = useWebDesign((s) => s.selection);
  const { zoom, panX, panY, tool, snapX, snapY, showRulers, editingTextId } = useView();

  // Space bar = temporary hand tool.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) spaceDown.current = true;
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && (spaceDown.current = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Wheel: pan, ctrl/cmd + wheel (and trackpad pinch) zooms. Non-passive to prevent page zoom.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const v = useView.getState();
      if (e.ctrlKey || e.metaKey) v.zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else v.setView({ panX: v.panX - (e.shiftKey ? e.deltaY : e.deltaX), panY: v.panY - (e.shiftKey ? 0 : e.deltaY) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toWorld = (clientX: number, clientY: number) => {
    const r = rootRef.current!.getBoundingClientRect();
    const v = useView.getState();
    return { x: (clientX - r.left - v.panX) / v.zoom, y: (clientY - r.top - v.panY) / v.zoom };
  };

  const hitTest = (s: WDScreen, x: number, y: number, deep = false): WDElement | undefined => {
    for (let i = s.elements.length - 1; i >= 0; i--) {
      const e = s.elements[i];
      if (e.type === 'group' || e.locked || !isEffectivelyVisible(s, e)) continue;
      if (x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) {
        if (deep) return e;
        const root = ops.rootAncestor(s, e.id);
        return root && !root.locked ? root : undefined;
      }
    }
    return undefined;
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    const root = rootRef.current!;
    root.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // Two-finger gesture: pinch zoom + pan. Cancel any single-pointer gesture.
      if (drag.current?.kind === 'move' || drag.current?.kind === 'resize') useWebDesign.getState().endGesture();
      drag.current = null;
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    const st = useWebDesign.getState();
    const s = selectScreen(st);
    const target = e.target as HTMLElement;
    const v = useView.getState();
    if (v.editingTextId) return;

    if (e.button === 1 || v.tool === 'hand' || spaceDown.current) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: v.panX, py: v.panY };
      return;
    }
    const w = toWorld(e.clientX, e.clientY);

    const rulerAxis = target.dataset.ruler as 'x' | 'y' | undefined;
    if (rulerAxis) {
      // Dragging out of the top ruler creates a horizontal guide (y), the left ruler a vertical one (x).
      const axis = rulerAxis === 'x' ? 'y' : 'x';
      const value = Math.round(axis === 'x' ? w.x : w.y);
      const base = s;
      st.live((sc) => ({ ...sc, guides: { ...sc.guides, [axis]: [...sc.guides[axis], value] } }));
      drag.current = { kind: 'guide', axis, index: base.guides[axis].length, base };
      return;
    }
    if (target.dataset.guide) {
      const [axis, idx] = target.dataset.guide.split(':') as ['x' | 'y', string];
      drag.current = { kind: 'guide', axis, index: Number(idx), base: s };
      return;
    }
    const handle = target.dataset.handle as Handle | undefined;
    if (handle && st.selection.length === 1) {
      const el = s.elements.find((x) => x.id === st.selection[0]);
      if (el && !el.locked) {
        drag.current = { kind: 'resize', handle, wx: w.x, wy: w.y, id: el.id, rect: { x: el.x, y: el.y, w: el.w, h: el.h }, base: s };
        return;
      }
    }
    const hit = hitTest(s, w.x, w.y);
    if (hit) {
      let sel = st.selection;
      if (e.shiftKey || e.metaKey || e.ctrlKey) sel = sel.includes(hit.id) ? sel.filter((i) => i !== hit.id) : [...sel, hit.id];
      else if (!sel.includes(hit.id)) sel = [hit.id];
      st.select(sel);
      drag.current = { kind: 'move', wx: w.x, wy: w.y, ids: sel, base: s, started: false };
    } else {
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (!additive) st.select([]);
      drag.current = { kind: 'marquee', wx: w.x, wy: w.y, cx: w.x, cy: w.y, additive, initial: additive ? st.selection : [] };
    }
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const r = rootRef.current!.getBoundingClientRect();
      const v = useView.getState();
      v.setView({ panX: v.panX + (cx - pinch.current.cx), panY: v.panY + (cy - pinch.current.cy) });
      if (pinch.current.dist > 0) useView.getState().zoomAt(dist / pinch.current.dist, cx - r.left, cy - r.top);
      pinch.current = { dist, cx, cy };
      return;
    }
    const d = drag.current;
    if (!d) return;
    const st = useWebDesign.getState();
    const v = useView.getState();
    if (d.kind === 'pan') {
      v.setView({ panX: d.px + e.clientX - d.sx, panY: d.py + e.clientY - d.sy });
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    const g = st.history.present.grid;
    if (d.kind === 'move') {
      let dx = w.x - d.wx;
      let dy = w.y - d.wy;
      if (!d.started) {
        if (Math.hypot(dx * v.zoom, dy * v.zoom) < 3) return;
        d.started = true;
      }
      const movingIds = new Set(d.ids.flatMap((id) => [id, ...ops.descendantIds(d.base, id)]));
      const moving = d.base.elements.filter((x) => d.ids.includes(x.id) && !x.locked);
      const b = ops.boundsOf(moving);
      if (!b) return;
      if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      const moved = { ...b, x: b.x + dx, y: b.y + dy };
      const targets = d.base.elements.filter((x) => !movingIds.has(x.id) && x.type !== 'group' && isEffectivelyVisible(d.base, x));
      const snap = e.altKey
        ? { dx: 0, dy: 0, guidesX: [], guidesY: [] }
        : ops.smartSnap(moved, targets, [0, d.base.width / 2, d.base.width, ...d.base.guides.x], [0, d.base.height / 2, d.base.height, ...d.base.guides.y], 6 / v.zoom);
      dx += snap.dx;
      dy += snap.dy;
      if (g.snap && !e.altKey) {
        if (!snap.dx) dx = ops.snapValue(b.x + dx, g.size) - b.x;
        if (!snap.dy) dy = ops.snapValue(b.y + dy, g.size) - b.y;
      }
      v.setSnapLines(snap.guidesX, snap.guidesY);
      st.live(() => ops.translateElements(d.base, d.ids, dx, dy));
    } else if (d.kind === 'resize') {
      const dx = w.x - d.wx;
      const dy = w.y - d.wy;
      let { x, y, w: rw, h: rh } = d.rect;
      const hdl = d.handle;
      if (hdl.includes('e')) rw = d.rect.w + dx;
      if (hdl.includes('s')) rh = d.rect.h + dy;
      if (hdl.includes('w')) {
        rw = d.rect.w - dx;
        x = d.rect.x + dx;
      }
      if (hdl.includes('n')) {
        rh = d.rect.h - dy;
        y = d.rect.y + dy;
      }
      if (e.shiftKey && d.rect.w > 0 && d.rect.h > 0) {
        const ratio = d.rect.w / d.rect.h;
        if (hdl === 'n' || hdl === 's') rw = rh * ratio;
        else rh = rw / ratio;
        if (hdl.includes('n')) y = d.rect.y + d.rect.h - rh;
        if (hdl.includes('w')) x = d.rect.x + d.rect.w - rw;
      }
      if (g.snap && !e.altKey) {
        const right = ops.snapValue(x + rw, g.size);
        const bottom = ops.snapValue(y + rh, g.size);
        if (hdl.includes('w')) x = ops.snapValue(x, g.size);
        if (hdl.includes('n')) y = ops.snapValue(y, g.size);
        rw = hdl.includes('e') ? right - x : hdl.includes('w') ? d.rect.x + d.rect.w - x : rw;
        rh = hdl.includes('s') ? bottom - y : hdl.includes('n') ? d.rect.y + d.rect.h - y : rh;
      }
      if (rw < 1) rw = 1;
      if (rh < 1) rh = 1;
      st.live(() => ops.resizeElement(d.base, d.id, { x, y, w: rw, h: rh }));
    } else if (d.kind === 'marquee') {
      d.cx = w.x;
      d.cy = w.y;
      const r = { x: Math.min(d.wx, d.cx), y: Math.min(d.wy, d.cy), w: Math.abs(d.cx - d.wx), h: Math.abs(d.cy - d.wy) };
      const m = marqueeRef.current;
      if (m) Object.assign(m.style, { display: 'block', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      const s = selectScreen(st);
      const hits = s.elements
        .filter((x) => !x.parentId && !x.locked && isEffectivelyVisible(s, x) && x.x < r.x + r.w && x.x + x.w > r.x && x.y < r.y + r.h && x.y + x.h > r.y)
        .map((x) => x.id);
      st.select([...d.initial, ...hits]);
    } else if (d.kind === 'guide') {
      const value = Math.round(d.axis === 'x' ? w.x : w.y);
      st.live((sc) => {
        const list = [...sc.guides[d.axis]];
        list[d.index] = value;
        return { ...sc, guides: { ...sc.guides, [d.axis]: list } };
      });
    }
  };

  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    const st = useWebDesign.getState();
    useView.getState().setSnapLines([], []);
    if (marqueeRef.current) marqueeRef.current.style.display = 'none';
    if (!d) return;
    if (d.kind === 'guide') {
      // Dropping a guide back on a ruler (or outside the canvas) removes it.
      const r = rootRef.current!.getBoundingClientRect();
      const outside = e.clientX - r.left < RULER || e.clientY - r.top < RULER || e.clientX > r.right || e.clientY > r.bottom;
      if (outside) {
        st.live((sc) => ({ ...sc, guides: { ...sc.guides, [d.axis]: sc.guides[d.axis].filter((_, i) => i !== d.index) } }));
      }
      st.endGesture();
      return;
    }
    if (d.kind === 'move' || d.kind === 'resize') st.endGesture();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const st = useWebDesign.getState();
    const s = selectScreen(st);
    const w = toWorld(e.clientX, e.clientY);
    const deep = hitTest(s, w.x, w.y, true);
    if (!deep) return;
    const root = ops.rootAncestor(s, deep.id);
    if (root && root.id !== deep.id && st.selection.includes(root.id)) {
      st.select([deep.id]); // enter group
      return;
    }
    if (TEXT_TYPES.has(deep.type)) {
      st.select([deep.id]);
      useView.getState().setEditingText(deep.id);
    }
  };

  const selectedEls = selection.map((id) => screen.elements.find((x) => x.id === id)).filter((x): x is WDElement => !!x);
  const bounds = ops.boundsOf(selectedEls);
  const hs = 8 / zoom;
  const editing = editingTextId ? screen.elements.find((x) => x.id === editingTextId) : undefined;

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-ink-950"
      style={{ cursor: tool === 'hand' ? 'grab' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      data-testid="wd-canvas"
    >
      <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }}>
        <div className="absolute left-0 -top-6 whitespace-nowrap text-ink-400" style={{ fontSize: 12 / zoom, top: -18 / zoom }}>
          {screen.name} · {screen.width}×{screen.height}
        </div>
        <div
          style={{
            position: 'relative',
            width: screen.width,
            height: screen.height,
            background: safeColor(screen.background, '#fff'),
            boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 10px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}
        >
          {screen.elements.map((el) =>
            el.type === 'group' || !isEffectivelyVisible(screen, el) || el.id === editingTextId ? null : (
              <div key={el.id} style={{ opacity: el.initiallyHidden ? 0.55 : 1 }}>
                <ElementView el={el} box={absBox(el)} />
              </div>
            ),
          )}
          {grid.show && grid.size * zoom >= 4 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: 'linear-gradient(to right, rgba(124,92,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(124,92,255,0.12) 1px, transparent 1px)',
                backgroundSize: `${grid.size}px ${grid.size}px`,
              }}
            />
          )}
        </div>
        {/* initially hidden elements are outlined so they can be found */}
        {screen.elements
          .filter((el) => el.initiallyHidden && isEffectivelyVisible(screen, el))
          .map((el) => (
            <div key={`h-${el.id}`} className="pointer-events-none absolute" style={{ left: el.x, top: el.y, width: el.w, height: el.h, outline: `${1 / zoom}px dashed #f59e0b` }} />
          ))}
        {/* guides */}
        {screen.guides.x.map((gx, i) => (
          <div key={`gx${i}`} data-guide={`x:${i}`} className="absolute cursor-ew-resize" style={{ left: gx - 3 / zoom, top: -100000, width: 6 / zoom, height: 200000 }}>
            <div data-guide={`x:${i}`} style={{ marginLeft: 3 / zoom - 0.5 / zoom, width: 1 / zoom, height: '100%', background: '#22d3ee' }} />
          </div>
        ))}
        {screen.guides.y.map((gy, i) => (
          <div key={`gy${i}`} data-guide={`y:${i}`} className="absolute cursor-ns-resize" style={{ top: gy - 3 / zoom, left: -100000, height: 6 / zoom, width: 200000 }}>
            <div data-guide={`y:${i}`} style={{ marginTop: 3 / zoom - 0.5 / zoom, height: 1 / zoom, width: '100%', background: '#22d3ee' }} />
          </div>
        ))}
        {/* smart alignment lines */}
        {snapX.map((x, i) => <div key={`sx${i}`} className="pointer-events-none absolute" style={{ left: x, top: -10000, width: 1 / zoom, height: 20000, background: '#f43f5e' }} />)}
        {snapY.map((y, i) => <div key={`sy${i}`} className="pointer-events-none absolute" style={{ top: y, left: -10000, height: 1 / zoom, width: 20000, background: '#f43f5e' }} />)}
        {/* selection */}
        {selectedEls.map((el) => (
          <div key={`s-${el.id}`} className="pointer-events-none absolute" style={{ left: el.x, top: el.y, width: el.w, height: el.h, outline: `${1.5 / zoom}px solid #7c5cff` }} />
        ))}
        {bounds && selectedEls.length > 1 && (
          <div className="pointer-events-none absolute" style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h, outline: `${1 / zoom}px dashed #9a82ff` }} />
        )}
        {selectedEls.length === 1 && !selectedEls[0].locked &&
          HANDLES.map((h) => {
            const el = selectedEls[0];
            const x = h.includes('w') ? el.x : h.includes('e') ? el.x + el.w : el.x + el.w / 2;
            const y = h.includes('n') ? el.y : h.includes('s') ? el.y + el.h : el.y + el.h / 2;
            return (
              <div
                key={h}
                data-handle={h}
                className="absolute rounded-[2px] border bg-white"
                style={{ left: x - hs / 2, top: y - hs / 2, width: hs, height: hs, borderWidth: 1 / zoom, borderColor: '#7c5cff', cursor: `${h}-resize` }}
              />
            );
          })}
        {selectedEls.length === 1 && (
          <div className="pointer-events-none absolute whitespace-nowrap rounded bg-accent-500 px-1 text-white" style={{ left: selectedEls[0].x, top: selectedEls[0].y + selectedEls[0].h + 6 / zoom, fontSize: 11 / zoom }}>
            {Math.round(selectedEls[0].w)} × {Math.round(selectedEls[0].h)}
          </div>
        )}
        <div ref={marqueeRef} className="pointer-events-none absolute hidden border border-accent-400 bg-accent-500/10" style={{ borderWidth: 1 / zoom }} />
        {editing && <InlineTextEditor el={editing} />}
      </div>
      {showRulers && <Rulers />}
    </div>
  );
}

function InlineTextEditor({ el }: { el: WDElement }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const field = el.type === 'input' ? 'placeholder' : 'text';
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const done = (save: boolean) => {
    const value = ref.current?.value ?? '';
    useView.getState().setEditingText(null);
    if (save && value !== (el[field] ?? '')) useWebDesign.getState().applyScreen((s) => ops.updateElements(s, [el.id], () => ({ [field]: value })));
  };
  return (
    <textarea
      ref={ref}
      defaultValue={el[field] ?? ''}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') done(false);
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || el.type !== 'text')) {
          e.preventDefault();
          done(true);
        }
      }}
      className="absolute resize-none outline-2 outline-accent-500"
      style={{
        left: el.x,
        top: el.y,
        width: Math.max(el.w, 80),
        height: Math.max(el.h, 32),
        fontSize: el.style.fontSize,
        fontWeight: el.style.fontWeight,
        fontFamily: el.style.fontFamily,
        textAlign: el.style.textAlign,
        color: '#111827',
        background: '#fff',
        padding: 4,
      }}
    />
  );
}
