/**
 * Camera animation utilities for the PulmoScan 3D viewer.
 *
 * All world coordinates come directly from the contract JSON (LUNA16 annotation
 * space) and are used as-is for vtkCamera focal points.
 */

// ---------------------------------------------------------------------------
// flyTo – smooth camera animation to a world coordinate
// ---------------------------------------------------------------------------

/**
 * Smoothly animate the camera so it looks at `worldCoord`.
 *
 * @param {vtkRenderer}  renderer   VTK renderer
 * @param {number[]}     worldCoord [x, y, z] world-space mm (from finding.center_world)
 * @param {number}       duration   Animation time in ms (default 1000)
 * @returns {Promise<void>}  Resolves when the animation finishes.
 */
export function flyTo(renderer, worldCoord, duration = 1000) {
  return new Promise((resolve) => {
    const camera = renderer.getActiveCamera();
    const renderWindow = renderer.getRenderWindow();

    // Snapshot current state
    const startFocal = camera.getFocalPoint().slice();
    const startPos = camera.getPosition().slice();
    const startUp = camera.getViewUp().slice();

    // Target state — keep a viewing distance proportional to scene size
    const bounds = renderer.computeVisiblePropBounds();
    const diag = Math.sqrt(
      (bounds[1] - bounds[0]) ** 2 +
      (bounds[3] - bounds[2]) ** 2 +
      (bounds[5] - bounds[4]) ** 2,
    );
    const viewDistance = diag * 0.45; // close-ish zoom

    // Direction from current position to focal point (keep orientation)
    const dir = [
      startPos[0] - startFocal[0],
      startPos[1] - startFocal[1],
      startPos[2] - startFocal[2],
    ];
    const dirLen = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2) || 1;
    const normDir = dir.map((d) => d / dirLen);

    const targetFocal = [...worldCoord];
    const targetPos = [
      worldCoord[0] + normDir[0] * viewDistance,
      worldCoord[1] + normDir[1] * viewDistance,
      worldCoord[2] + normDir[2] * viewDistance,
    ];

    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Smooth-step easing
      const s = t * t * (3 - 2 * t);

      camera.setFocalPoint(
        startFocal[0] + (targetFocal[0] - startFocal[0]) * s,
        startFocal[1] + (targetFocal[1] - startFocal[1]) * s,
        startFocal[2] + (targetFocal[2] - startFocal[2]) * s,
      );
      camera.setPosition(
        startPos[0] + (targetPos[0] - startPos[0]) * s,
        startPos[1] + (targetPos[1] - startPos[1]) * s,
        startPos[2] + (targetPos[2] - startPos[2]) * s,
      );
      // Keep view-up stable
      camera.setViewUp(
        startUp[0] + (0 - startUp[0]) * s,
        startUp[1] + (0 - startUp[1]) * s,
        startUp[2] + (1 - startUp[2]) * s, // z-up in world
      );

      renderWindow.render();

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(tick);
  });
}

// ---------------------------------------------------------------------------
// resetCamera – animate back to overview
// ---------------------------------------------------------------------------

/**
 * Smoothly animate back to the default overview (resetCamera) position.
 *
 * @param {vtkRenderer}  renderer
 * @param {number}       duration  Animation time in ms (default 800)
 * @returns {Promise<void>}
 */
export function resetCamera(renderer, duration = 800) {
  const camera = renderer.getActiveCamera();
  const renderWindow = renderer.getRenderWindow();

  // Compute where resetCamera WOULD place the camera
  const startFocal = camera.getFocalPoint().slice();
  const startPos = camera.getPosition().slice();
  const startUp = camera.getViewUp().slice();

  // Temporarily reset to get target values
  renderer.resetCamera();
  const targetFocal = camera.getFocalPoint().slice();
  const targetPos = camera.getPosition().slice();
  const targetUp = camera.getViewUp().slice();

  // Restore current pose so we can animate
  camera.setFocalPoint(...startFocal);
  camera.setPosition(...startPos);
  camera.setViewUp(...startUp);

  return new Promise((resolve) => {
    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const s = t * t * (3 - 2 * t);

      camera.setFocalPoint(
        startFocal[0] + (targetFocal[0] - startFocal[0]) * s,
        startFocal[1] + (targetFocal[1] - startFocal[1]) * s,
        startFocal[2] + (targetFocal[2] - startFocal[2]) * s,
      );
      camera.setPosition(
        startPos[0] + (targetPos[0] - startPos[0]) * s,
        startPos[1] + (targetPos[1] - startPos[1]) * s,
        startPos[2] + (targetPos[2] - startPos[2]) * s,
      );
      camera.setViewUp(
        startUp[0] + (targetUp[0] - startUp[0]) * s,
        startUp[1] + (targetUp[1] - startUp[1]) * s,
        startUp[2] + (targetUp[2] - startUp[2]) * s,
      );

      renderWindow.render();

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(tick);
  });
}

export default { flyTo, resetCamera };
