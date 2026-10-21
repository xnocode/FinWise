// Free, serverless-friendly LLM — works anywhere with NO API key and NO signup.
// Uses free OpenAI-compatible inference with standard fetch, zero bundle overhead, and zero native dependencies.

export async function runFreeLLM(params: {
  systemPrompt: string
  history: { role: string; content: string }[]
  userMessage: string
}): Promise<string> {
  const { systemPrompt, history, userMessage } = params
  const recent = history.slice(-4)

  const messages = [
    { role: 'system', content: systemPrompt },
    ...recent.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage },
  ]

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 9000)

  try {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        model: 'openai',
        temperature: 0.7,
        max_tokens: 600,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`Free LLM HTTP error: ${res.status}`)
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (content && typeof content === 'string') {
      return content.trim()
    }
    throw new Error('No completion returned')
  } finally {
    clearTimeout(timeoutId)
  }
}

export function freeLLMReady() {
  return true
}
