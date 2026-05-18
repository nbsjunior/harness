/** Sessions cancelled by the user (extension sends chat:cancel). */
const cancelledSessions = new Set<string>();

export function cancelChatSession(sessionId: string): void {
  cancelledSessions.add(sessionId);
}

export function isChatSessionCancelled(sessionId: string): boolean {
  return cancelledSessions.has(sessionId);
}

export function clearChatSessionCancel(sessionId: string): void {
  cancelledSessions.delete(sessionId);
}
