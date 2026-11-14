// The Ask HemoScope panel's behaviour as plain functions, so it can be tested without a browser. app/ask.tsx calls these.

import { search, type Answer } from "./search";

export type AskState = { open: boolean; history: Answer[] };
export const ASK_START: AskState = { open: false, history: [] };
export const ASK_HISTORY_LIMIT = 50;

export const ASK_SUGGESTIONS = ["What does Monitor Closely mean?", "Why do neutrophils change in space?", "How is CPR done in space?"];

// Typing a question and pressing Enter (or a suggestion, or the panel's send button): the panel opens and shows the answer.
export function submitQuestion(state: AskState, text: string): AskState {
  const q = text.trim();
  if (!q) return { ...state, open: true };
  return { open: true, history: [...state.history, search(q)].slice(-ASK_HISTORY_LIMIT) };
}

// The magnifying glass in the header. With text it asks the question, and with an empty input it only opens the panel.
export const pressGlass = (state: AskState, text: string): AskState => submitQuestion(state, text);

// Escape closes the panel and keeps the conversation.
export const pressEscape = (state: AskState): AskState => (state.open ? { ...state, open: false } : state);
export const closePanel = (state: AskState): AskState => (state.open ? { ...state, open: false } : state);

// The tab on the right edge: opens the panel, or closes it when it is open.
export const toggleAsk = (state: AskState): AskState => (state.open ? closePanel(state) : submitQuestion(state, ""));

export const clearConversation = (state: AskState): AskState => ({ ...state, history: [] });

// After a result opens its place: the panel stays open beside the page on wide screens and closes on narrow screens.
export const afterGo = (state: AskState, wide: boolean): AskState => (wide ? state : closePanel(state));
