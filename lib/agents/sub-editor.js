import { callClaude, safeJsonParse } from "./_shared.js";

const SYSTEM_PROMPT = `You are the Sub-editor of Plain Sight. You receive a complete draft edition and produce the final published version. Your job: catch and fix any remaining jargon, tonal drift, repetition across stories, or factual inconsistency. Tighten verbose paragraphs. Sharpen weak headlines. Do NOT add new content. Do NOT change the structure. Do NOT change what stories are in the edition. Output ONLY valid JSON matching the EXACT input schema with edits applied. If the draft is already good, return it unchanged. The draft: [INJECTED]`;

export async function subEditor(draft) {
  if (!draft) {
    throw new Error("No draft provided to sub-editor");
  }

  const draftJson = JSON.stringify(draft, null, 2);
  let result;

  try {
    result = await callClaude(
      SYSTEM_PROMPT,
      `Final pass on this edition draft:\n${draftJson}`,
      4000
    );
  } catch (e) {
    console.error("SubEditor call failed:", e.message);
    throw e;
  }

  if (!result || typeof result !== "object") {
    const parsed = safeJsonParse(result);
    if (!parsed) {
      console.warn("SubEditor returned invalid JSON, returning draft unchanged");
      return draft;
    }
    result = parsed;
  }

  if (!result.edition_date || !result.lead_story) {
    console.warn("SubEditor returned incomplete result, returning draft unchanged");
    return draft;
  }

  return {
    ...result,
    myth: result.myth || draft.myth,
    practice: result.practice || draft.practice,
  };
}

export default { subEditor };