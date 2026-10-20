// Free, local LLM — works anywhere with NO API key and NO signup.
// Powered by transformers.js (runs in Node.js and the browser).
// Model: TinyLlama-1.1B-Chat (quantized, ~600 MB, instruct-tuned, fully free, Apache 2.0).
// Change MODEL_ID to any Hugging Face text-generation model you prefer.
import { pipeline } from '@xenova/transformers'

const MODEL_ID = 'Xenova/TinyLlama-1.1B-Chat-v1.0'

let generator: any = null
let loadPromise: Promise<void> | null = null

async function ensureGenerator() {
  if (generator) return generator
  if (loadPromise) return loadPromise.then(() => generator!)
  loadPromise = (async () => {
    generator = await pipeline('text-generation', MODEL_ID, {
      // Quantized weights = smaller download + lower RAM usage
      dtype: 'q8f16',
    })
  })()
  return loadPromise.then(() => generator!)
}

export async function runFreeLLM(params: {
  systemPrompt: string
  history: { role: string; content: string }[]
  userMessage: string
}): Promise<string> {
  const gen = await ensureGenerator()

  const { systemPrompt, history, userMessage } = params
  const recent = history.slice(-4)

  // Build a TinyLlama-style chat prompt
  let prompt = `${systemPrompt}\n\n`
  for (const m of recent) {
    prompt += `<|${m.role}|>\n${m.content}\n`
  }
  prompt += '<|assistant|>\n'

  const output = await gen(prompt, {
    max_new_tokens: 500,
    temperature: 0.7,
    top_p: 0.9,
    do_sample: true,
  })

  const text = output[0]?.generated_text || ''
  const marker = '<|assistant|>\n'
  const idx = text.lastIndexOf(marker)
  const reply = idx !== -1 ? text.slice(idx + marker.length) : text
  return reply.trim() || 'I could not process your request.'
}

export function freeLLMReady() {
  return !!generator
}
