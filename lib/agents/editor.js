import { callClaude, safeJsonParse } from "./_shared.js";

const SYSTEM_PROMPT = `You are the Editor of Plain Sight, a daily cybersecurity briefing for ordinary, non-technical people in the UK. Your job is to choose ONE lead story and THREE secondary stories from a pool of candidate threats and articles. Choose stories that are: relevant to ordinary people (not enterprise security professionals), recent or evergreen-and-important, varied in category (don't pick four phishing stories), and emotionally varied (not all alarming, not all dry). The lead should be the most consequential or distinctive story. Output ONLY valid JSON, no prose: {"lead_id": string, "secondary_ids": [string, string, string], "editorial_note": "one sentence on why this combination — for our records, not published"}. The candidates are: [INJECTED]`;

export async function editor(candidates) {
  if (!candidates || candidates.length === 0) {
    throw new Error("No candidates provided to editor");
  }

  const candidateJson = JSON.stringify(candidates, null, 2);
  let result;

  try {
    result = await callClaude(
      SYSTEM_PROMPT,
      `Here are the candidate threats:\n${candidateJson}\n\nChoose the lead story and three secondaries. Return JSON only.`,
      1500
    );
  } catch (e) {
    console.error("Editor call failed:", e.message);
    throw e;
  }

  if (!result || typeof result !== "object") {
    const parsed = safeJsonParse(result);
    if (!parsed) {
      throw new Error("Editor returned invalid JSON");
    }
    result = parsed;
  }

  if (!result.lead_id || !result.secondary_ids || result.secondary_ids.length < 3) {
    console.warn("Editor returned incomplete result, using defaults");
    result = {
      lead_id: candidates[0]?.id || "fallback-first",
      secondary_ids: [
        candidates[1]?.id || "fallback-second",
        candidates[2]?.id || "fallback-third",
        candidates[3]?.id || "fallback-fourth",
      ],
      editorial_note: "Selected from fallback candidates",
    };
  }

  return result;
}

export default { editor };