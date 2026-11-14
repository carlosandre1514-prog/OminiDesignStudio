import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './modules';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[OmniDesign] Service worker não registrado:', e));
  });
}

// Ask the browser to keep our IndexedDB data even under storage pressure.
navigator.storage?.persist?.().catch(() => undefined);
