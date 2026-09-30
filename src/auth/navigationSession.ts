// Temporary proof exists only in this document's memory. Never store it in browser storage.
let navigationKey = '';
export function beginNavigationSession(remember: boolean) {
  navigationKey = remember ? '' : Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
  return navigationKey || undefined;
}
export function clearNavigationSession() { navigationKey=''; }
export function navigationHeaders(): Record<string,string> {
  return navigationKey ? { 'X-Contas-Tatu-Navigation':navigationKey } : {};
}
