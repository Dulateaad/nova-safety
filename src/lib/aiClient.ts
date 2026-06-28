import { aiProviderLabel, resolveAiProvider } from '../config/aiProvider'
import type { UiChatTurn } from './chatAssistant'
import {
  claudeChat,
  claudeGenerateText,
  claudeGenerateTextForExtraction,
  claudeGenerateWithFileForComplexExtraction,
  claudeGenerateWithFileForExtraction,
  isClaudeConfigured,
} from './claudeClient'

export function activeAiProvider() {
  return resolveAiProvider()
}

export function activeAiProviderLabel(): string {
  return aiProviderLabel()
}

export function isAiConfigured(): boolean {
  return isClaudeConfigured()
}

export function isAiClientReady(): boolean {
  return isClaudeConfigured()
}

export function isAiAccessDeniedError(_message: string): boolean {
  return false
}

export async function aiGenerateText(opts: {
  systemPrompt: string
  userPrompt: string
  json?: boolean
}): Promise<string> {
  return claudeGenerateText(opts)
}

export async function aiGenerateTextForExtraction(opts: {
  systemPrompt: string
  userPrompt: string
}): Promise<string> {
  return claudeGenerateTextForExtraction(opts)
}

/** PDF ППР и multimodal-извлечение — Haiku (VITE_CLAUDE_EXTRACTION_MODEL). */
export async function aiGenerateWithFileForExtraction(opts: {
  systemPrompt: string
  userPrompt: string
  mimeType: string
  dataBase64: string
}): Promise<string> {
  return claudeGenerateWithFileForExtraction(opts)
}

/** NEBOSH и другие тяжёлые задачи — Sonnet (VITE_CLAUDE_COMPLEX_EXTRACTION_MODEL). */
export async function aiGenerateWithFileForComplexExtraction(opts: {
  systemPrompt: string
  userPrompt: string
  mimeType: string
  dataBase64: string
}): Promise<string> {
  return claudeGenerateWithFileForComplexExtraction(opts)
}

export async function aiGenerateWithFile(opts: {
  systemPrompt: string
  userPrompt: string
  mimeType: string
  dataBase64: string
  json?: boolean
}): Promise<string> {
  return claudeGenerateWithFileForExtraction({
    systemPrompt: opts.systemPrompt,
    userPrompt: opts.userPrompt,
    mimeType: opts.mimeType,
    dataBase64: opts.dataBase64,
  })
}

export async function aiChat(opts: {
  systemPrompt: string
  history: UiChatTurn[]
}): Promise<string> {
  return claudeChat(opts)
}
