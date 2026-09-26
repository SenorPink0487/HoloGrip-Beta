export type CaptureResult =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: 'cancel' | 'unavailable' };

/** Open the device camera in a page overlay and return one JPEG frame. */
export function captureProblemPhoto(): Promise<CaptureResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return Promise.resolve({ ok: false, reason: 'unavailable' });
  }

  return new Promise((resolve) => {
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      .then((stream) => {
        const overlay = document.createElement('div');
        overlay.className = 'math-capture-overlay';
        overlay.innerHTML = `
          <video class="math-capture-video" autoplay playsinline></video>
          <div class="math-capture-actions">
            <button type="button" class="apple-glass-action-btn" id="math-capture-cancel">取消</button>
            <button type="button" class="apple-glass-action-btn" id="math-capture-shutter">拍照</button>
          </div>
        `;
        const video = overlay.querySelector('video') as HTMLVideoElement;
        video.srcObject = stream;
        void video.play().catch(() => {});

        let settled = false;
        const finish = (result: CaptureResult) => {
          if (settled) return;
          settled = true;
          document.removeEventListener('keydown', onKey);
          stream.getTracks().forEach((track) => track.stop());
          overlay.remove();
          resolve(result);
        };
        const onKey = (event: KeyboardEvent) => {
          if (event.key === 'Escape') finish({ ok: false, reason: 'cancel' });
        };
        document.addEventListener('keydown', onKey);

        overlay.querySelector('#math-capture-cancel')?.addEventListener('click', (event) => {
          event.stopPropagation();
          finish({ ok: false, reason: 'cancel' });
        });
        overlay.querySelector('#math-capture-shutter')?.addEventListener('click', (event) => {
          event.stopPropagation();
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            finish({ ok: false, reason: 'unavailable' });
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          finish({ ok: true, dataUrl: canvas.toDataURL('image/jpeg', 0.85) });
        });

        document.body.appendChild(overlay);
      })
      .catch(() => resolve({ ok: false, reason: 'unavailable' }));
  });
}
