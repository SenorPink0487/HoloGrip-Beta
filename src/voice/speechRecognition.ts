import { invoke } from '@tauri-apps/api/core';

export interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

let nextSession = 0;

/** WKWebView can expose webkitSpeechRecognition without a working recognition service. */
class AppleSpeechRecognition implements SpeechRecognitionLike {
  lang = 'zh-CN';
  interimResults = false;
  continuous = false;
  onresult: SpeechRecognitionLike['onresult'] = null;
  onerror: SpeechRecognitionLike['onerror'] = null;
  onend: SpeechRecognitionLike['onend'] = null;
  private sessionId: string | null = null;

  start(): void {
    if (this.sessionId) throw new DOMException('Recognition already started', 'InvalidStateError');
    const sessionId = `${Date.now()}-${++nextSession}`;
    this.sessionId = sessionId;
    void invoke<{ transcript: string; cancelled?: boolean }>('plugin:apple-vision|startSpeech', {
      sessionId,
      lang: this.lang,
    }).then((result) => {
      if (this.sessionId !== sessionId) return;
      if (!result.cancelled && result.transcript.trim()) {
        this.onresult?.({
          resultIndex: 0,
          results: [{ isFinal: true, 0: { transcript: result.transcript } }],
        });
      }
    }).catch((error: unknown) => {
      if (this.sessionId !== sessionId) return;
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      this.onerror?.({ error: typeof code === 'string' ? code : 'speech-unavailable' });
    }).finally(() => {
      if (this.sessionId !== sessionId) return;
      this.sessionId = null;
      this.onend?.();
    });
  }

  stop(): void {
    const sessionId = this.sessionId;
    this.sessionId = null;
    if (sessionId) {
      void invoke('plugin:apple-vision|stopSpeech', { sessionId }).catch(() => {});
    }
  }

  abort(): void {
    this.stop();
  }
}

export function createSpeechRecognition(): SpeechRecognitionLike | null {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/i.test(ua)
    || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    return new AppleSpeechRecognition();
  }

  const host = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function speechErrorMessage(error: string): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '请在系统设置中允许麦克风和语音识别权限后重试';
    case 'audio-capture':
      return '麦克风不可用，请检查权限或关闭正在占用麦克风的应用';
    case 'network':
      return '语音识别连接失败，请检查网络后重试';
    case 'language-not-supported':
      return '当前设备不支持中文语音识别，请使用键盘听写或直接打字';
    case 'speech-unavailable':
      return '语音识别暂不可用，请检查系统语音识别设置后重试';
    default:
      return '没有听清，请再说一次或直接打字';
  }
}
