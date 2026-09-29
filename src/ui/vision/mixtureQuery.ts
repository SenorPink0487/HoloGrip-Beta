import type { ChemistryEngine } from '../../chemistry/ChemistryEngine.ts';
import { requestMixtureAnalysis } from '../../chemistry/analyzeMixture.ts';

interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export interface MixtureQueryBinding {
  destroy: () => void;
}

export function bindMixtureQuery(
  root: ParentNode,
  selectors: { input: string; voice: string; analyze: string; status: string },
  options: { getEngine: () => ChemistryEngine; onPoured?: () => void },
): MixtureQueryBinding {
  let analyzing = false;
  let voice: SpeechRecognitionLike | null = null;

  const statusEl = () => root.querySelector(selectors.status);
  const inputEl = () => root.querySelector(selectors.input) as HTMLInputElement | null;
  const voiceButton = () => root.querySelector(selectors.voice);

  const setStatus = (text: string, isError = false) => {
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
      current?.stop();
    } catch {
      // 识别器可能已处于停止状态。
    }
  };

  const submit = async () => {
    if (analyzing) return;
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
      options.onPoured?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '成分分析失败', true);
    } finally {
      analyzing = false;
      if (button) button.disabled = false;
    }
  };

  const toggleVoice = () => {
    if (voice) {
      stopVoice();
      return;
    }
    const host = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition;
    if (!Ctor) {
      setStatus('这台设备不能语音输入，请直接打字', true);
      return;
    }
    const recognition = new Ctor();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let text = '';
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }
      const input = inputEl();
      if (input) input.value = text.trim().slice(0, 40);
      if (isFinal) void submit();
    };
    recognition.onerror = () => {
      setStatus('没有听清，请再说一次或直接打字', true);
      stopVoice();
    };
    recognition.onend = () => {
      voiceButton()?.classList.remove('listening');
      voice = null;
    };
    voice = recognition;
    voiceButton()?.classList.add('listening');
    try {
      recognition.start();
      setStatus('正在听…');
    } catch {
      setStatus('麦克风没有打开', true);
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
      stopVoice();
      root.querySelector(selectors.input)?.removeEventListener('keydown', onKeyDown);
      root.querySelector(selectors.analyze)?.removeEventListener('click', onAnalyze);
      root.querySelector(selectors.voice)?.removeEventListener('click', onVoice);
    },
  };
}
