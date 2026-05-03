import { callClaude, safeJsonParse } from "./_shared.js";

const SYSTEM_PROMPT = `You are the Storyteller of Plain Sight, rewriting a cybersecurity threat or news item into a calm, plain-English story for ordinary UK readers. The reader is not technical. The reader's grandmother is not technical. Your job: write a headline (8-12 words, plain English, no jargon, no exclamations), a 2-3 paragraph body (each paragraph 2-4 sentences, no lists, no bullet points), and a single 'what to do' line that's a concrete actionable step. Tone: warm, knowledgeable, never alarmist, never patronising. NEVER use the words 'sophisticated', 'leveraged', 'malicious actor', 'threat landscape', 'cybercriminals'. Use 'scammers', 'thieves', or 'attackers' instead. NEVER use phrases like 'Great question' or AI-assistant pleasantries — you are a journalist, not a chatbot. If source information is provided in the input, include it in the output's sources array. Output ONLY valid JSON: {"headline": string, "body": [string, string, string], "pulled_quote": "one arresting sentence pulled from the body, OR a fresh sentence under 25 words", "what_to_do": string, "category": string, "severity": "LOW"|"MEDIUM"|"HIGH", "sources": [{"name": string, "url": string}]}. The raw story to rewrite: [INJECTED]`;

const SYSTEM_PROMPT_SECONDARY = `You are the Storyteller of Plain Sight, rewriting a cybersecurity threat or news item into a calm, plain-English story for ordinary UK readers. The reader is not technical. The reader's grandmother is not technical. Your job: write a headline (8-12 words, plain English, no jargon, no exclamations), a 2-paragraph body (each paragraph 2-4 sentences, no lists, no bullet points), and a single 'what to do' line that's a concrete actionable step. Tone: warm, knowledgeable, never alarmist, never patronising. NEVER use the words 'sophisticated', 'leveraged', 'malicious actor', 'threat landscape', 'cybercriminals'. Use 'scammers', 'thieves', or 'attackers' instead. NEVER use phrases like 'Great question' or AI-assistant pleasantries — you are a journalist, not a chatbot. If source information is provided in the input, include it in the output's sources array. Output ONLY valid JSON: {"headline": string, "body": [string, string], "pulled_quote": "", "what_to_do": string, "category": string, "severity": "LOW"|"MEDIUM"|"HIGH", "sources": [{"name": string, "url": string}]}. The raw story to rewrite: [INJECTED]`;

export async function storyteller({ raw, is_lead = false }) {
  if (!raw) {
    throw new Error("No raw story provided to storyteller");
  }

  const storyJson = JSON.stringify(raw, null, 2);
  const prompt = is_lead ? SYSTEM_PROMPT : SYSTEM_PROMPT_SECONDARY;
  
  let result;

  try {
    result = await callClaude(
      prompt,
      `Rewrite this raw story into Plain Sight voice:\n${storyJson}`,
      1500
    );
  } catch (e) {
    console.error("Storyteller call failed:", e.message);
    throw e;
  }

  if (!result || typeof result !== "object") {
    const parsed = safeJsonParse(result);
    if (!parsed) {
      throw new Error("Storyteller returned invalid JSON");
    }
    result = parsed;
  }

  if (!result.headline || !result.body || !Array.isArray(result.body)) {
    console.warn("Storyteller returned incomplete result");
    result = {
      headline: raw.raw_headline?.substring(0, 80) || "A security story",
      body: [raw.raw_summary?.substring(0, 200) || "Something happened."],
      pulled_quote: "",
      what_to_do: "Stay alert and think before you click.",
      category: raw.category || "other",
      severity: raw.severity || "MEDIUM",
    };
  }

  const sources = (raw.source_name && raw.source_url)
    ? [{ name: raw.source_name, url: raw.source_url }]
    : raw.source_url
      ? [{ name: String(raw.source_url), url: "" }]
      : [];

  return {
    headline: result.headline,
    body: result.body,
    pulled_quote: result.pulled_quote || "",
    what_to_do: result.what_to_do,
    severity: result.severity,
    category: result.category,
    sources: result.sources || sources,
  };
}

export default { storyteller };