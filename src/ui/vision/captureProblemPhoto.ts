export type CaptureResult =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: 'cancel' | 'unavailable' };

/** 在页面浮层中打开设备摄像头并返回单帧 JPEG 图像，若环境受限则优雅降级为原生相机拍照。 */
export function captureProblemPhoto(): Promise<CaptureResult> {
  const hasGetUserMedia = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  if (!hasGetUserMedia) {
    if (typeof document === 'undefined') {
      return Promise.resolve({ ok: false, reason: 'unavailable' });
    }
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp';
      input.setAttribute('capture', 'environment');
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) {
          resolve({ ok: false, reason: 'cancel' });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve({ ok: true, dataUrl: reader.result });
          } else {
            resolve({ ok: false, reason: 'unavailable' });
          }
        };
        reader.onerror = () => resolve({ ok: false, reason: 'unavailable' });
        reader.readAsDataURL(file);
      });

      input.addEventListener('cancel', () => {
        input.remove();
        resolve({ ok: false, reason: 'cancel' });
      });

      input.click();
    });
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
