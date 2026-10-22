# HoloGrip Agent Rules & Constraints

## 1. Strict Zero Floating Popups & Banners Invariant (严禁出现任何提示弹窗与浮动向导)

1. **Zero DOM Popups/Banners Policy**:
   - Under NO circumstances should any experiment inject DOM floating modals, top guidance banners, step cards, notification toasts, or floating button handles into the 3D experiment view.
   - The 3D viewport must remain 100% clean, immersive, and obstruction-free.

2. **Pure 3D Direct Manipulation**:
   - All experiment steps (dragging, snapping, hanging, swinging, downward detachment, plumb line generation, intersection determination) must be accomplished SOLELY through native 3D meshes, physics dynamics solvers, and raycast interactions.
   - Feedback must be purely physical: 3D magnetic glow on pins, damped physical pendulum swing, surface-etched plumb lines, and 3D center of gravity reticles.

3. **Free Cursor Standard for Desk Experiments**:
   - Direct-manipulation desk experiments must disable pointer lock and hide the center crosshair to allow free mouse cursor navigation across the 3D scene without camera jitter.

---

## 2. High-Fidelity 3D Craftsmanship & Anti-Primitive Invariant (严禁粗糙几何拼接，3D建模必须极致细致)

1. **Strictly Prohibit Rudimentary Primitive Stitching (严禁使用简单圆柱体或长方体做粗糙拼接)**:
   - Direct stacking or crude stitching of unadorned `CylinderGeometry` and `BoxGeometry` to create laboratory apparatus is STRICTLY PROHIBITED.
   - Models must never look like generic geometric toy blocks. All equipment must meet professional scientific research and precision educational laboratory standards.

2. **Extreme Mechanical Details & Engineering Craftsmanship (工业级机械倒角与精密装配细节)**:
   - **Chamfers & Transitions**: Sharp, un-beveled corners or zero-thickness planes are strictly forbidden. All edges must have authentic mechanical chamfers, fillets, or stamped rolled edges.
   - **Functional Machining Features**: Knurled adjustment thumbwheels, anti-slip grooves, dovetail guide slots, linear ball bearing blocks, dual chrome guide rods, brass compression collars, hex locking nuts, and micrometer thimble engravings must be physically modeled.
   - **Laser-Etched Scales & Reading Cursors**: Any linear or angular measurement device (e.g. optical benches, vernier calipers, micrometer drums) must feature crisp, physically etched millimeter or degree graduations with high-contrast vernier index lines.
   - **Authentic Engineering Anatomy**: Bases must incorporate anti-tip ballast weight profiles, leveling vibration-isolation footpads, cable strain relief boots, and clearance recesses.

3. **Premium Lab Materials & Anti-Black Policy (高级科研材质规范，严禁脏黑塑料)**:
   - **No Muddy Black Materials**: Using dull, featureless, pitch-black materials is strictly forbidden ("不要用黑色，黑的太丑了").
   - **Approved Material Palette**:
     - *Aerospace Satin Silver Aluminum* (`0xf1f5f9` / `0xe2e8f0`, low roughness, fine brushed metallic sheen).
     - *Mirror Polished Liquid Chrome / 316L Stainless Steel* (`0xffffff`, roughness 0.05~0.15, metalness 0.95~1.0 for ultra-smooth rails and shafts).
     - *Champagne Brass / Polished Brass* (`0xf59e0b` / `0xd97706` for precision adjustment knobs, collars, and nozzles).
     - *Physical Clear Optical Glass* (with subtle Fresnel reflections).
     - *Deep Oceanic Sapphire Display Panels* (`#08101e` / `#0a192f` for observation screens, with high-contrast fluorescent cyan/green HUD overlays).

4. **Direct Operator Facing Standard (实验器材必须正对操作者视线)**:
   - Apparatus layout on the HoloTable must be oriented so that the primary observation screen, measurement graduations, telemetry readouts, and control knobs squarely face the user (+Z direction toward operator camera).
   - Long rail instruments (e.g., optical benches) must stretch horizontally along the X-axis, with scales and knobs directly facing forward (+Z), never angling backwards away from the user.

---

## 3. Safe Code Search Standard & Resource Protection (严禁根目录盲目 grep，防止后台常驻高负载)

1. **Strictly Forbid Unconstrained `grep -rn .` in Root**:
   - The workspace contains Tauri/Rust compilation artifacts in `src-tauri/target/` (including 12GB+ binary caches like `CompilationCache.noindex/.../index.v1`) and extensive `node_modules/`.
   - Running unconstrained `grep -rn <pattern> .` at root traps the process scanning massive binary blobs, burning 100% CPU indefinitely and leaving orphan background processes.

2. **Mandatory Safe Search Practices**:
   - **Primary**: Always use `git grep -in "<keyword>"` (automatically respects `.gitignore` and ignores binary caches in milliseconds).
   - **Targeted**: Restrict searches to explicit code directories, e.g., `grep -rn "<keyword>" src/ tests/`.
   - **Explicit Exclusions**: If `grep` must be used from root, always supply exclusions: `--exclude-dir={node_modules,target,.git,dist}`.

