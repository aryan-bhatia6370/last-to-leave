// 3D scene for the whiteboard games (Equations, Pictionary): you're sitting on
// the bench; Paul stands in front of you holding a handheld whiteboard up.
// The board's two sides are canvases the game draws on (front = facing you
// when flip = 0). In Pictionary his right hand holds the marker at the pen tip.

import * as THREE from 'three';
import { createStage3D } from './stage.js';
import { buildCourtyard } from './courtyard.js';
import { createHandBoard, createMarker3D, createEraser3D, setRodPose } from './props.js';
import { createPaul3D } from './paul3d.js';
import { createCamera } from '../shared/scene3d.js';
import { drawBoard } from '../shared/whiteboard.js';
import { createRng } from '../core/rng.js';

export function createBoardStage(container, { boardW = 0.7, boardH = 0.52, boardZ = 1.25, boardY = -0.13, eyeHeight = 1.15, onResize } = {}) {
  let cam = null;
  let size = null;
  const stage = createStage3D(container, {
    onResize: (s) => {
      size = s;
      cam = createCamera(s, { fovYDeg: 50, cyFrac: 0.46, maxFocalW: 1.25 });
      onResize?.(s);
    },
    getCam: () => cam,
  });
  const floorY = -eyeHeight;
  buildCourtyard(stage, {
    floorY, buildingZ: 16, shadowCenter: [0, 1.6], shadowSize: 4,
    tables: [{ x: -2.6, z: 5.5, rotDeg: 15 }, { x: 3.1, z: 6.5, rotDeg: -20 }],
  });

  // board sides are canvases (aspect matches the board)
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = Math.round((1024 * boardH) / boardW);
    return c;
  };
  const front = mk();
  const back = mk();
  const board = createHandBoard(boardW, boardH, { frontCanvas: front, backCanvas: back });
  stage.scene.add(board);
  const paul = createPaul3D();
  stage.scene.add(paul.group);
  const pen = createMarker3D('#1f1f22');
  pen.visible = false;
  stage.scene.add(pen);
  let eraser = null;
  createEraser3D().then((e) => { eraser = e; eraser.visible = false; stage.scene.add(eraser); });

  const v = new THREE.Vector3();
  const local = (x, y, z) => {
    v.set(x, y, z);
    board.localToWorld(v);
    return [v.x, v.y, -v.z];
  };

  /** A fresh whiteboard surface on a canvas (frameless; the 3D board has the frame). */
  function clearSurface(ctx) {
    const { width: w, height: h } = ctx.canvas;
    drawBoard(ctx, -40, -40, w + 80, h + 80, { frame: 40, rng: createRng(31) });
  }

  return {
    stage,
    get cam() { return cam; },
    get size() { return size; },
    hud: stage.hud,
    front,
    back,
    frontCtx: front.getContext('2d'),
    backCtx: back.getContext('2d'),
    clearSurface,
    refresh() {
      board.userData.front.needsUpdate = true;
      board.userData.back.needsUpdate = true;
    },
    /**
     * flip: rotation of the board (0 = front faces you, PI = back faces you)
     * penUV: [u, v] on the front (0..1) while drawing, else null
     * eraseUV: [u, v] while erasing, else null
     */
    pose({ flip = 0, penUV = null, eraseUV = null } = {}) {
      board.position.set(0, boardY, -boardZ);
      board.rotation.set(0, flip, 0);
      board.updateMatrixWorld(true);
      const leftHand = local(-boardW / 2 + 0.012, -boardH * 0.12, -0.03);
      let rightHand = local(boardW / 2 - 0.012, -boardH * 0.12, -0.03);
      pen.visible = false;
      if (eraser) eraser.visible = false;
      if (penUV) {
        const px = (penUV[0] - 0.5) * boardW, py = (0.5 - penUV[1]) * boardH;
        const tip = local(px, py, 0.006);
        const butt = local(px + 0.05, py - 0.08, 0.11);
        setRodPose(pen, butt, tip);
        pen.visible = true;
        rightHand = local(px + 0.035, py - 0.06, 0.085);
      } else if (eraseUV && eraser) {
        const ex = (eraseUV[0] - 0.5) * boardW, ey = (0.5 - eraseUV[1]) * boardH;
        eraser.position.copy(v.set(ex, ey, 0.027));
        board.localToWorld(eraser.position);
        eraser.quaternion.copy(board.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
        eraser.visible = true;
        rightHand = local(ex, ey - 0.01, 0.07);
      }
      paul.update({ x: 0, z: boardZ + 0.32, floorY, yaw: 0, leftHand, rightHand });
    },
    render() { stage.render(); },
    destroy() { stage.destroy(); },
  };
}
