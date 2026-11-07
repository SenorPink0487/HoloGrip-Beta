export interface ProblemPhotoSelection {
  dataUrl?: string;
  cancelled?: boolean;
}

/** iPad 应用直接打开原生相册，浏览器在当前点击事件中打开图片选择器。 */
export async function pickProblemPhoto(
  fileInput: HTMLInputElement | null
): Promise<ProblemPhotoSelection | null> {
  const isAppleMobile = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
  if (isAppleMobile && typeof window !== 'undefined' && (
    '__TAURI_INTERNALS__' in window || '__TAURI__' in window
  )) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<ProblemPhotoSelection>('plugin:apple-vision|pickPhoto') ?? {};
  }

  // 不在 click() 之前 await，以保留浏览器要求的用户激活状态。
  fileInput?.click();
  return null;
}
