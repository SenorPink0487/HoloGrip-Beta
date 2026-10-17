# HoloGrip Agent Rules & Constraints

## Strict Zero Floating Popups & Banners Invariant (严禁出现任何提示弹窗与浮动向导)

1. **Zero DOM Popups/Banners Policy**:
   - Under NO circumstances should any experiment inject DOM floating modals, top guidance banners, step cards, notification toasts, or floating button handles into the 3D experiment view.
   - The 3D viewport must remain 100% clean, immersive, and obstruction-free.

2. **Pure 3D Direct Manipulation**:
   - All experiment steps (dragging, snapping, hanging, swinging, downward detachment, plumb line generation, intersection determination) must be accomplished SOLELY through native 3D meshes, physics dynamics solvers, and raycast interactions.
   - Feedback must be purely physical: 3D magnetic glow on pins, damped physical pendulum swing, surface-etched plumb lines, and 3D center of gravity reticles.

3. **Free Cursor Standard for Desk Experiments**:
   - Direct-manipulation desk experiments must disable pointer lock and hide the center crosshair to allow free mouse cursor navigation across the 3D scene without camera jitter.
