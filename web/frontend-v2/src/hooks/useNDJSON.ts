export async function* streamNDJSON<T = unknown>(res: Response): AsyncGenerator<T, void, void> {
  if (!res.body) throw new Error('No response body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        yield JSON.parse(trimmed) as T;
      }
    }
    const remaining = buffer.trim();
    if (remaining) yield JSON.parse(remaining) as T;
  } finally {
    reader.releaseLock();
  }
}
