// Módulo da Câmera — getUserMedia + preview espelhado
export async function startCamera(videoEl, { width = 1280, height = 720 } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Navegador sem suporte a câmera. Use Chrome desktop.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: width }, height: { ideal: height }, facingMode: 'user' },
    audio: false
  });
  videoEl.srcObject = stream;
  videoEl.muted = true;
  await videoEl.play();
  return stream;
}

export function stopCamera(videoEl) {
  const s = videoEl?.srcObject;
  if (s) s.getTracks().forEach(t => t.stop());
  if (videoEl) videoEl.srcObject = null;
}

// Stream segue utilizável? (aba perdeu permissão / track encerrou = precisa reabrir)
export function isLive(stream) {
  const t = stream?.getVideoTracks?.()[0];
  return !!t && t.readyState === 'live';
}

export function stopStreamTracks(stream) {
  try { stream?.getTracks?.().forEach(t => t.stop()); } catch {}
}
