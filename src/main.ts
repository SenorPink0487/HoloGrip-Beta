import { Engine } from './core/Engine';

function init() {
  (window as any).__ENGINE__ = new Engine('webgl-container');
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
