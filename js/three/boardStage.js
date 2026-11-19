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
  // the back face shows right side up after a top-over flip (see pose)
  board.userData.back.center.set(0.5, 0.5);
  board.userData.back.rotation = Math.PI;
  const posed = { x: 0, crouch: 0, yaw: 0 }; // Paul's smoothed body position
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
      // Flipping turns the board over top-to-bottom while he holds it by its left and
      // right edges (the axis runs through his hands), so his arms never cross or go
      // through it. The back face's picture is turned 180° to read right side up.
      board.position.set(0, boardY, -boardZ);
      board.rotation.set(flip, 0, 0);
      board.updateMatrixWorld(true);
      pen.visible = false;
      if (eraser) eraser.visible = false;
      const tool = penUV || (eraseUV && eraser ? eraseUV : null);
      if (!tool) {
        // holding it up from behind, one hand on each side edge
        posed.x += (0 - posed.x) * 0.15;
        posed.crouch += (0 - posed.crouch) * 0.15;
        posed.yaw += (0 - posed.yaw) * 0.15;
        paul.update({
          x: posed.x, z: boardZ + 0.3, floorY: floorY - posed.crouch, yaw: posed.yaw,
          leftHand: local(-boardW / 2 - 0.005, 0, -0.01), rightHand: local(boardW / 2 + 0.005, 0, -0.01),
        });
        return;
      }
      // Drawing / erasing like a person at an easel: he stands beside the board (your
      // right), holds its edge with his left hand, and moves along with the pen — stepping
      // over and bending down for low spots — so his arm always reaches (no stretching).
      // Anything of his that's in front of the drawing turns see-through.
      const tx = (tool[0] - 0.5) * boardW, ty = (0.5 - tool[1]) * boardH;
      const tipW = local(tx, ty, 0);
      let hand;
      if (penUV) {
        const tip = local(tx, ty, 0.006);
        const butt = local(tx + 0.05, ty - 0.08, 0.11);
        setRodPose(pen, butt, tip);
        pen.visible = true;
        hand = local(tx + 0.035, ty - 0.06, 0.085);
      } else {
        eraser.position.copy(v.set(tx, ty, 0.027));
        board.localToWorld(eraser.position);
        eraser.quaternion.copy(board.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
        eraser.visible = true;
        hand = local(tx, ty - 0.01, 0.07);
      }
      const edge = boardW / 2;
      const wantX = Math.min(edge + 0.36, Math.max(tipW[0] + 0.48, edge - 0.1));
      const shoulderY0 = floorY + 1.43;
      const wantCrouch = Math.max(0, Math.min(0.22, shoulderY0 - (tipW[1] + 0.42)));
      posed.x += (wantX - posed.x) * 0.12;
      posed.crouch += (wantCrouch - posed.crouch) * 0.12;
      posed.yaw += (0.75 - posed.yaw) * 0.12;
      const inFront = posed.x - 0.24 < edge; // his body is over the board on screen
      paul.update({
        x: posed.x, z: boardZ - 0.06, floorY: floorY - posed.crouch, yaw: posed.yaw,
        leftHand: local(edge - 0.01, -boardH * 0.28, 0.012),
        rightHand: hand,
        rightPole: [0.4, -0.7, -0.5], // elbow out to his side, down, toward you (never into the board)
        opacity: inFront ? 0.45 : 1,
        rightArmOpacity: 0.4,
      });
    },
    render() { stage.render(); },
    destroy() { stage.destroy(); },
  };
}
