import { Engine } from './core/Engine';
import { WhiteboardApp } from './whiteboard/WhiteboardApp';
import { preloadAccountAssets } from './whiteboard/AccountModal';

function init() {
  preloadAccountAssets();
  const engine = new Engine('webgl-container');
  (window as any).__ENGINE__ = engine;

  const whiteboardApp = new WhiteboardApp({
    engine,
  });
  (window as any).__WHITEBOARD__ = whiteboardApp;
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

