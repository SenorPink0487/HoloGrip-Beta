import type { ChemistryEngine } from '../../chemistry/ChemistryEngine.ts';
import { requestMixtureAnalysis } from '../../chemistry/analyzeMixture.ts';
import type { AnalyzedMixture } from '../../chemistry/mixtureAnalysis.ts';
import { createSpeechRecognition, speechErrorMessage, type SpeechRecognitionLike } from '../../voice/speechRecognition.ts';

export interface MixtureQueryBinding {
  destroy: () => void;
}

export function bindMixtureQuery(
  root: ParentNode,
  selectors: { input: string; voice: string; analyze: string; status: string },
  options: { getEngine: () => ChemistryEngine; onPoured?: (mixture: AnalyzedMixture) => void },
): MixtureQueryBinding {
  let analyzing = false;
  let destroyed = false;
  let voice: SpeechRecognitionLike | null = null;

  const statusEl = () => root.querySelector(selectors.status);
  const inputEl = () => root.querySelector(selectors.input) as HTMLInputElement | null;
  const voiceButton = () => root.querySelector(selectors.voice);

  const setStatus = (text: string, isError = false) => {
    if (destroyed) return;
    const status = statusEl();
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('is-error', isError);
  };

  const stopVoice = () => {
    const current = voice;
    voice = null;
    voiceButton()?.classList.remove('listening');
    try {
      if (current?.abort) current.abort();
      else current?.stop();
    } catch {
      // 识别器可能已处于停止状态。
    }
  };

  const submit = async () => {
    if (analyzing || destroyed) return;
    const query = inputEl()?.value.trim() ?? '';
    if (!query) {
      setStatus('先输入或说出一种东西', true);
      return;
    }
    stopVoice();
    inputEl()?.blur?.();
    analyzing = true;
    const button = root.querySelector(selectors.analyze) as HTMLButtonElement | null;
    if (button) button.disabled = true;
    setStatus('正在拆分成分…');
    try {
      const mixture = await requestMixtureAnalysis(query);
      if (destroyed) return;
      const reaction = options.getEngine().pourAnalyzedMixture(mixture);
      if (!reaction) {
        setStatus('这只烧杯已经满了', true);
        return;
      }
      const names = mixture.components.map((component) => component.name).join('、');
      const reacted = reaction.id !== 'mixture_analysis' && reaction.id !== 'mixture_fizz'
        ? `，并发生${reaction.title}`
        : '';
      setStatus(`${mixture.name}：${names}${reacted}`);
      options.onPoured?.(mixture);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '成分分析失败', true);
    } finally {
      analyzing = false;
      if (button) button.disabled = false;
    }
  };

  const toggleVoice = () => {
    if (analyzing || destroyed) return;
    if (voice) {
      stopVoice();
      setStatus('语音输入已停止');
      return;
    }
    if (window.isSecureContext === false && !('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
      setStatus('语音输入需要 HTTPS，请通过安全连接打开实验室', true);
      return;
    }
    let recognition: SpeechRecognitionLike | null;
    try {
      recognition = createSpeechRecognition();
    } catch {
      setStatus(speechErrorMessage('speech-unavailable'), true);
      return;
    }
    if (!recognition) {
      inputEl()?.focus?.();
      setStatus('请使用键盘上的麦克风听写，或直接打字', true);
      return;
    }
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = false;
    let transcript = '';
    recognition.onresult = (event) => {
      if (voice !== recognition || destroyed) return;
      let text = '';
      let isFinal = event.results.length > 0;
      // Results are cumulative; resultIndex only identifies the changed segment.
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
        if (!event.results[i].isFinal) isFinal = false;
      }
      transcript = text.trim().slice(0, 40);
      const input = inputEl();
      if (input && transcript) input.value = transcript;
      if (isFinal && transcript) void submit();
    };
    recognition.onerror = (event) => {
      if (voice !== recognition || destroyed) return;
      setStatus(speechErrorMessage(event.error), true);
      stopVoice();
    };
    recognition.onend = () => {
      if (voice !== recognition || destroyed) return;
      voiceButton()?.classList.remove('listening');
      voice = null;
      // Some WebKit versions end after delivering only an interim result.
      if (transcript) void submit();
      else setStatus('没有听到语音，请再试一次', true);
    };
    voice = recognition;
    voiceButton()?.classList.add('listening');
    try {
      // Keep browser start() in the tap handler: Safari requires user activation.
      recognition.start();
      setStatus('正在听…');
    } catch (error) {
      const denied = error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      setStatus(speechErrorMessage(denied ? 'not-allowed' : 'audio-capture'), true);
      stopVoice();
    }
  };

  const onKeyDown = (event: Event) => {
    if ((event as KeyboardEvent).key !== 'Enter') return;
    event.preventDefault();
    void submit();
  };
  const onAnalyze = () => {
    void submit();
  };
  const onVoice = () => {
    toggleVoice();
  };

  root.querySelector(selectors.input)?.addEventListener('keydown', onKeyDown);
  root.querySelector(selectors.analyze)?.addEventListener('click', onAnalyze);
  root.querySelector(selectors.voice)?.addEventListener('click', onVoice);

  return {
    destroy() {
      destroyed = true;
      stopVoice();
      root.querySelector(selectors.input)?.removeEventListener('keydown', onKeyDown);
      root.querySelector(selectors.analyze)?.removeEventListener('click', onAnalyze);
      root.querySelector(selectors.voice)?.removeEventListener('click', onVoice);
    },
  };
}
