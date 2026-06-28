import {
  buildControlMeasuresPdfRetryPrompt,
  buildControlMeasuresPdfUserPrompt,
  PPR_CONTROL_MEASURES_SYSTEM_PROMPT,
} from '../config/pprControlMeasuresPrompt'
import type { PprAttachment } from '../types/ppr'
import {
  aiGenerateWithFileForComplexExtraction,
  aiGenerateWithFileForExtraction,
  isAiClientReady,
} from './aiClient'
import type { GeminiExtractResult } from './pprGeminiExtract'
import { normalizeNdprFromPayload } from './pprNdprExtract'
import {
  minimalControlMeasuresFallback,
  normalizeControlMeasuresItems,
  normalizePdfDocumentFromPayload,
  parseControlMeasuresJson,
} from './pprControlMeasuresParse'
import { guessMimeType } from './pprAttachment'
import { normalizePprWorkTitle } from './narjadTitle'

function attachmentMime(att: PprAttachment): string {
  if (att.mimeType?.trim()) return att.mimeType.trim()
  return guessMimeType(att.fileName, '')
}

function sanitizeBase64(data: string): string {
  return data.replace(/\s+/g, '')
}

export function isPdfAttachment(att: PprAttachment): boolean {
  const ext = att.fileName.split('.').pop()?.toLowerCase() ?? ''
  const mime = attachmentMime(att)
  return ext === 'pdf' || mime === 'application/pdf'
}

export function isPprPdfAiReady(): boolean {
  return isAiClientReady()
}

function buildResultFromPayload(
  payload: ReturnType<typeof parseControlMeasuresJson>,
  opts?: { allowMinimalFallback?: boolean },
): GeminiExtractResult {
  const workTitle = normalizePprWorkTitle(String(payload.workTitle ?? ''))
  const ndprExtract = normalizeNdprFromPayload(payload)
  let items = normalizeControlMeasuresItems(payload, {
    workTitle,
  })

  if (items.length === 0 && ndprExtract.workStages.trim()) {
    items = normalizeControlMeasuresItems(
      {
        ...payload,
        items: [
          {
            section: 'Этапы работ',
            hazard: 'Операционные риски',
            controlMeasures: ndprExtract.workStages
              .split('\n')
              .map((l) => l.trim())
              .filter((l) => l.length > 8)
              .slice(0, 12),
          },
        ],
      },
      { workTitle },
    )
  }

  if (items.length === 0 && opts?.allowMinimalFallback) {
    items = minimalControlMeasuresFallback(workTitle)
  }

  return {
    workTitle,
    items,
    geminiPdfDocument: normalizePdfDocumentFromPayload(payload),
    ndprExtract,
  }
}

async function requestPdfExtraction(
  attachment: PprAttachment,
  userPrompt: string,
  useComplexModel: boolean,
): Promise<string> {
  const dataBase64 = sanitizeBase64(attachment.dataBase64)
  const opts = {
    systemPrompt: PPR_CONTROL_MEASURES_SYSTEM_PROMPT,
    userPrompt,
    mimeType: 'application/pdf',
    dataBase64,
  }
  if (useComplexModel) {
    return aiGenerateWithFileForComplexExtraction(opts)
  }
  return aiGenerateWithFileForExtraction(opts)
}

/** Claude Haiku читает PDF ППР (VITE_CLAUDE_EXTRACTION_MODEL). */
export async function extractControlMeasuresFromPdfWithGemini(
  attachment: PprAttachment,
): Promise<GeminiExtractResult> {
  if (!isAiClientReady()) {
    throw new Error(
      'Для PDF нужен ключ Claude (VITE_ANTHROPIC_API_KEY). Загрузите .docx или настройте API.',
    )
  }

  const attempts: Array<{ prompt: string; complex: boolean }> = [
    { prompt: buildControlMeasuresPdfUserPrompt(attachment.fileName), complex: false },
    { prompt: buildControlMeasuresPdfRetryPrompt(attachment.fileName), complex: false },
    { prompt: buildControlMeasuresPdfRetryPrompt(attachment.fileName), complex: true },
  ]

  let lastResult: GeminiExtractResult | null = null

  for (const attempt of attempts) {
    try {
      const raw = await requestPdfExtraction(
        attachment,
        attempt.prompt,
        attempt.complex,
      )
      const payload = parseControlMeasuresJson(raw)
      const result = buildResultFromPayload(payload)
      lastResult = result
      if (result.items.length > 0) {
        return result
      }
    } catch {
      /* следующая попытка */
    }
  }

  if (lastResult && lastResult.items.length === 0) {
    const fallback = buildResultFromPayload(
      { workTitle: lastResult.workTitle },
      { allowMinimalFallback: true },
    )
    if (fallback.items.length > 0) {
      return {
        ...lastResult,
        items: fallback.items,
      }
    }
  }

  throw new Error('ИИ не извлёк меры контроля из PDF')
}
