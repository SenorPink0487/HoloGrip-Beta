import { normalizeMixtureQuery, parseAnalyzedMixture, type AnalyzedMixture } from './mixtureAnalysis.ts';
import { apiBase } from '../account/api.ts';

export async function requestMixtureAnalysis(query: string): Promise<AnalyzedMixture> {
  const trimmed = normalizeMixtureQuery(query);
  if (!trimmed) throw new Error('先输入或说出一种东西');

  let response: Response;
  try {
    const base = apiBase();
    const endpoint = base === 'http://127.0.0.1:8080'
      ? '/api/chem/analyze'
      : `${base}/api/chem/analyze`;
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: trimmed }),
      signal: AbortSignal.timeout(15_000),
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
