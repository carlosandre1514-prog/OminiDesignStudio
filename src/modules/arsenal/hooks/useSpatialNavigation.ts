import { useEffect } from 'react';
import { KEY_DIR, keepsArrow, moveFocus } from './spatialNav';

/**
 * Global D-pad / arrow-key navigation for the Smart TV profile (also handy on PC with a keyboard).
 * - Arrows move focus to the nearest control in that direction.
 * - Enter activates the focused control (native for buttons; toggles checkboxes).
 * - Back / Escape / Backspace (outside text fields) calls `onBack` (close panel, leave camera mode…).
 */
export function useSpatialNavigation(opts: { enabled: boolean; root?: () => ParentNode | null; onBack?: () => void }) {
  const { enabled, root, onBack } = opts;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const dir = KEY_DIR[e.key];
      if (dir) {
        if (keepsArrow(active, dir)) return;
        if (moveFocus(dir, root?.() ?? document)) e.preventDefault();
        return;
      }
      const typing = active instanceof HTMLInputElement && active.type !== 'range' && active.type !== 'checkbox' ? true : active instanceof HTMLTextAreaElement;
      if (e.key === 'Enter' && active instanceof HTMLInputElement && active.type === 'checkbox') {
        active.click();
        e.preventDefault();
        return;
      }
      // Tizen/webOS remotes send "XF86Back"/"GoBack"/keyCode 10009/461.
      const isBack = e.key === 'Escape' || e.key === 'GoBack' || e.key === 'XF86Back' || e.keyCode === 10009 || e.keyCode === 461 || (e.key === 'Backspace' && !typing);
      if (isBack && onBack) {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, root, onBack]);
}
