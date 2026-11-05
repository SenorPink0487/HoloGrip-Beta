import './ui/demonstration.css';
import './ui/vision/tutorial.css';
import './ui/vision/chemistry.css';
import { Engine } from './core/Engine';
import { WhiteboardApp } from './whiteboard/WhiteboardApp';
import { preloadAccountAssets } from './whiteboard/AccountModal';
import { initTouchModeTracking } from './controls/touchMode';

function init() {
  initTouchModeTracking();
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

