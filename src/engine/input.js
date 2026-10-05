// InputManager — TODA a entrada do MovoKids num só lugar (a "base").
// Câmera persistente + pose + mãos + gestos. Chamado 1x por frame pelo jogo.
//
// Uso:
//   const input = new InputManager(videoEl, [previewEl, gameEl]);
//   await input.ensureCamera();          // abre/reusa (nunca fechar entre partidas!)
//   await input.initVision({ hands: true });
//   const frame = input.nextFrame();     // { joints, raw, handsList, thumbsUp, framing, hasCamera }
//   const frame = input.nextFrame({ pose: false }); // só mãos (telas de menu = CPU livre)
import { startCamera, isLive, stopStreamTracks } from '../camera/camera.js';
import { initPose, initHands, detectPose, detectHands } from '../vision/mediapipe.js';
import { isThumbsUp } from '../vision/gestures.js';
import {
  mapJointsToGoal, checkFraming, resetSmooth
} from '../vision/tracking.js';

const CAM_TIMEOUT_MS = 10000;

export class InputManager {
  constructor(videoEl, previewEls = []) {
    this.video = videoEl;
    this.previewEls = previewEls;
    this.stream = null;
    this.hasCamera = false;
    this._poseOk = false;
    this._handsOk = false;
    this._lastPose = null;
    this._lastHands = [];
  }

  // Abre a câmera uma vez e reusa. Se a track morreu, reabre sozinho.
  async ensureCamera() {
    if (isLive(this.stream)) return this.stream;
    stopStreamTracks(this.stream);
    this.stream = null;
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout câmera')), CAM_TIMEOUT_MS));
    this.stream = await Promise.race([startCamera(this.video), timeout]);
    for (const el of [this.video, ...this.previewEls]) {
      if (el && el.srcObject !== this.stream) {
        el.srcObject = this.stream;
        el.play().catch(() => {});
      }
    }
    this.stream.getVideoTracks()[0].onended = () => {
      this.stream = null;
      this.hasCamera = false;
    };
    this.hasCamera = true;
    return this.stream;
  }

  async initVision({ hands = true } = {}) {
    await initPose();
    this._poseOk = true;
    if (hands) {
      try { await initHands(); this._handsOk = true; }
      catch { this._handsOk = false; }
    }
    return { pose: this._poseOk, hands: this._handsOk };
  }

  get handsEnabled() { return this._handsOk; }

  reset() {
    resetSmooth();
    this._lastPose = null;
    this._lastHands = [];
  }

  // 1 chamada por frame. Retorna o "estado do jogador" pronto pro jogo usar.
  // joints: articulações já mapeadas p/ o plano do jogo (null = sem dados).
  // thumbsUp: joinha em qualquer mão visível.
  nextFrame({ pose = true, hands = false } = {}) {
    const out = {
      joints: null,
      raw: this._lastPose,
      handsList: this._lastHands,
      thumbsUp: false,
      framing: null,
      hasCamera: this.hasCamera
    };
    if (!this.hasCamera) return out;
    if (pose && this._poseOk) {
      let lm = null;
      try { lm = detectPose(this.video); } catch { lm = null; }
      if (lm) this._lastPose = lm;
      if (this._lastPose) out.joints = mapJointsToGoal(this._lastPose);
      out.raw = this._lastPose;
      out.framing = checkFraming(this._lastPose);
    }
    if (hands && this._handsOk) {
      let hr = null;
      try { hr = detectHands(this.video); } catch { hr = null; }
      if (hr !== null) this._lastHands = hr; // null = throttle, mantém cache
      out.handsList = this._lastHands;
      out.thumbsUp = this._lastHands.some(h => isThumbsUp(h).ok);
    }
    return out;
  }

  // Só ao sair pro menu: para tudo e fecha a câmera de verdade.
  fullCleanup() {
    stopStreamTracks(this.stream);
    this.stream = null;
    this.hasCamera = false;
    this._lastPose = null;
    this._lastHands = [];
    for (const el of [this.video, ...this.previewEls]) {
      if (el) el.srcObject = null;
    }
    this.reset();
  }
}

// Segurar-firmar: retorna progresso 0..1 (ex: joinha por 1.2s dispara ação).
// `state` é um { value: 0 } mutável guardado por quem chama.
export function holdProgress(state, holdSeconds, detected, dt, decay = 2) {
  state.value = detected ? state.value + dt : Math.max(0, state.value - dt * decay);
  return Math.min(1, state.value / holdSeconds);
}
export function resetHold(state) { state.value = 0; }
