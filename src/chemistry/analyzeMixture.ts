import { normalizeMixtureQuery, parseAnalyzedMixture, type AnalyzedMixture } from './mixtureAnalysis.ts';

export async function requestMixtureAnalysis(query: string): Promise<AnalyzedMixture> {
  const trimmed = normalizeMixtureQuery(query);
  if (!trimmed) throw new Error('先输入或说出一种东西');

  let response: Response;
  try {
    response = await fetch('/api/chem/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: trimmed }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('分析超时，请再说一次');
    }
    throw new Error('连不上成分分析，请用 npm run dev 打开实验室');
  }

  const payload = await response.json().catch(() => ({})) as { error?: unknown; mixture?: unknown };
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : '成分分析失败');
  }
  return parseAnalyzedMixture(payload.mixture);
}
