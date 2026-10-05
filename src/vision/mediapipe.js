// MediaPipe tasks-vision moderno — PoseLandmarker (lite) + HandLandmarker (gestos)
// Eficiência: pose throttled a ~30fps, mãos a ~8fps (só usadas nos menus).
import { FilesetResolver, PoseLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';

let vision = null;
let pose = null;
let hands = null;
let lastVideoTime = -1;
let lastPoseMs = 0;
let lastHandsMs = 0;

const POSE_MIN_GAP = 20; // ms entre detecções de corpo (~50fps máx, menos lag)
const HANDS_MIN_GAP = 120; // gesto de menu não precisa de alta taxa

async function getVision() {
  if (!vision) {
    vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
  }
  return vision;
}

export async function initPose() {
  if (pose) return pose;
  const v = await getVision();
  pose = await PoseLandmarker.createFromOptions(v, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  return pose;
}

export async function initHands() {
  if (hands) return hands;
  const v = await getVision();
  hands = await HandLandmarker.createFromOptions(v, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  return hands;
}

export function handsReady() { return !!hands; }

// Retorna array de 33 landmarks normalizados, null se "sem frame novo"
// (o chamador mantém o último válido em cache — sem flicker).
export function detectPose(video) {
  if (!pose || !video || video.readyState < 2) return null;
  if (video.currentTime === lastVideoTime) return null;
  const now = performance.now();
  if (now - lastPoseMs < POSE_MIN_GAP) return null; // throttle: reaproveita último
  lastPoseMs = now;
  lastVideoTime = video.currentTime;
  try {
    const res = pose.detectForVideo(video, now);
    return res?.landmarks?.[0] || null;
  } catch {
    return null;
  }
}

// Retorna array de mãos (cada uma com 21 pontos), [] se "viu: zero mãos",
// null se "sem dado novo" (throttle) — o chamador mantém cache.
export function detectHands(video) {
  if (!hands || !video || video.readyState < 2) return null;
  const now = performance.now();
  if (now - lastHandsMs < HANDS_MIN_GAP) return null;
  lastHandsMs = now;
  try {
    const res = hands.detectForVideo(video, now);
    return res?.landmarks || [];
  } catch {
    return [];
  }
}
