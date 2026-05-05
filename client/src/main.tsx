import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Router } from './router';
import { registerServiceWorker } from './services/serviceWorker';
import './styles/global.css';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router />
  </StrictMode>
);
