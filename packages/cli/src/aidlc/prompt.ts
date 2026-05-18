import type { ChatMessage } from '../types.js';
import { AIDLC_ACTIVATION_PREFIX } from './constants.js';

export function isAidlcActivationPrompt(text: string): boolean {
  return /using\s+ai-?dlc\b/i.test(text);
}

/**
 * Build the prompt passed to `kiro-cli chat --no-interactive`.
 * Ensures AI-DLC workflow activates when the user selected Kiro + AI-DLC intent.
 */
export function buildKiroPrompt(
  messages: ChatMessage[],
  options: { forceAidlc?: boolean } = {},
): string {
  const systemParts = messages
    .filter((m) => m.role === 'system' && m.content.trim())
    .map((m) => m.content.trim());

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  let userText = lastUser?.content?.trim() ?? '';

  const wantsAidlc =
    options.forceAidlc ||
    isAidlcActivationPrompt(userText) ||
    messages.some((m) => m.role === 'user' && isAidlcActivationPrompt(m.content));

  if (wantsAidlc && !isAidlcActivationPrompt(userText)) {
    userText = `${AIDLC_ACTIVATION_PREFIX}, ${userText}`;
  }

  const blocks: string[] = [];
  if (systemParts.length > 0) {
    blocks.push(systemParts.join('\n\n'));
  }
  if (userText) {
    blocks.push(userText);
  }

  return blocks.join('\n\n') || AIDLC_ACTIVATION_PREFIX;
}
