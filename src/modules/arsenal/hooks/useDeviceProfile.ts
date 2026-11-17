import { useEffect, useState } from 'react';

export type DeviceProfile = 'pc' | 'mobile' | 'tv';

const KEY = 'arsenal.profile';
const TV_UA = /smart-?tv|smarttv|tizen|web0s|webos|netcast|hbbtv|bravia|aft[a-z]|crkey|googletv|android tv|roku|viera|philipstv|vidaa/i;

/** Best guess from the environment (user agent, pointer type, screen width). */
export function detectProfile(ua: string, coarse: boolean, width: number): DeviceProfile {
  if (TV_UA.test(ua)) return 'tv';
  if (coarse && width < 1100) return 'mobile';
  if (width < 768) return 'mobile';
  return 'pc';
}

/**
 * Current layout profile. The user can force one (stored per device); otherwise it is detected
 * and updated on resize. Pressing an arrow key with no mouse movement on a large screen also
 * switches an "auto" PC into TV mode (TV browsers often report a desktop user agent).
 */
export function useDeviceProfile() {
  const read = () => {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'pc' || v === 'mobile' || v === 'tv' ? v : null;
    } catch {
      return null;
    }
  };
  const [forced, setForced] = useState<DeviceProfile | null>(read);
  const detect = () => detectProfile(navigator.userAgent, matchMedia('(pointer: coarse)').matches, window.innerWidth);
  const [auto, setAuto] = useState<DeviceProfile>(detect);

  useEffect(() => {
    const onResize = () => setAuto((a) => (a === 'tv' ? a : detect()));
    let mouseMoved = false;
    const onMouse = () => (mouseMoved = true);
    const onKey = (e: KeyboardEvent) => {
      if (!mouseMoved && e.key.startsWith('Arrow') && window.innerWidth >= 960 && !matchMedia('(pointer: coarse)').matches) setAuto('tv');
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouse, { once: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const setProfile = (p: DeviceProfile | null) => {
    try {
      if (p) localStorage.setItem(KEY, p);
      else localStorage.removeItem(KEY);
    } catch {
      /* private mode: keep in memory */
    }
    setForced(p);
  };
  return { profile: forced ?? auto, forced, setProfile };
}
