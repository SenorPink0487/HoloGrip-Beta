/** Pull the first JSON object out of a model reply, including fenced blocks. */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('没有认出图里的立体');
  }
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new Error('没有认出图里的立体');
  }
}
