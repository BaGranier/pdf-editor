/** Draft editors may veto a mode change while explicit validation is required.
 * Committed PDF edits and history never participate in this ephemeral UI event.
 */
export const BEFORE_TOOL_CHANGE = "pdf-editor:before-tool-change";
export function requestToolChange(): boolean {
  return window.dispatchEvent(new Event(BEFORE_TOOL_CHANGE, { cancelable: true }));
}
