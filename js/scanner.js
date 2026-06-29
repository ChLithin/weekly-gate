// scanner.js — turns the phone camera into a QR reader using jsQR (loaded via CDN in index.html).

let _stream = null;
let _rafId = null;

async function startScanner(videoEl, canvasEl, onDecode, onError) {
  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch (err) {
    onError && onError(err);
    return;
  }

  videoEl.srcObject = _stream;
  await videoEl.play();

  const ctx = canvasEl.getContext("2d", { willReadFrequently: true });

  const tick = () => {
    if (!_stream) return; // stopped
    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      const result = window.jsQR
        ? window.jsQR(imageData.data, imageData.width, imageData.height)
        : null;
      if (result && result.data) {
        stopScanner();
        onDecode(result.data);
        return;
      }
    }
    _rafId = requestAnimationFrame(tick);
  };
  _rafId = requestAnimationFrame(tick);
}

function stopScanner() {
  if (_rafId) cancelAnimationFrame(_rafId);
  _rafId = null;
  if (_stream) {
    _stream.getTracks().forEach((t) => t.stop());
    _stream = null;
  }
}
