import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { callClaude, safeJsonParse } from "./_shared.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRACTICE_BANK_PATH = path.join(__dirname, "..", "..", "data", "practice-bank.json");

const SYSTEM_PROMPT = `You are the Practitioner of Plain Sight, writing this week's practice piece — one practical security habit explained beautifully. Expand the brief seed into a 3-paragraph piece. Each paragraph is 2-4 sentences. Plain English, warm tone, no lists. The closing line should be memorable — something the reader will recall when the situation arises. NEVER use the words 'sophisticated' or 'leveraged' or jargon. Output ONLY valid JSON: {"title": string (verb-led), "subtitle": "This week's practice", "body": [string, string, string]}. The topic seed: [INJECTED]`;

function loadPracticeBank() {
  try {
    const data = fs.readFileSync(PRACTICE_BANK_PATH, "utf8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to load practice bank:", e);
    return [];
  }
}

function selectRandomPractice() {
  const practices = loadPracticeBank();
  if (practices.length === 0) {
    return {
      id: "prac-default",
      title: "How to spot a fake delivery text",
      core_lesson: "Real couriers never ask for payment via text.",
      context_seed: "A delivery text is the most common scam in the UK.",
    };
  }
  const index = Math.floor(Math.random() * practices.length);
  return practices[index];
}

export async function practitioner() {
  const selectedPractice = selectRandomPractice();

  const practiceJson = JSON.stringify(selectedPractice, null, 2);
  let result;

  try {
    result = await callClaude(
      SYSTEM_PROMPT,
      `Expand this practice seed into a Plain Sight article:\n${practiceJson}`,
      1500
    );
  } catch (e) {
    console.error("Practitioner call failed:", e.message);
    throw e;
  }

  if (!result || typeof result !== "object") {
    const parsed = safeJsonParse(result);
    if (!parsed) {
      throw new Error("Practitioner returned invalid JSON");
    }
    result = parsed;
  }

  if (!result.title || !result.body || !Array.isArray(result.body)) {
    console.warn("Practitioner returned incomplete result");
    result = {
      title: selectedPractice.title,
      subtitle: "This week's practice",
      body: [
        selectedPractice.core_lesson || "Here's what matters.",
        selectedPractice.context_seed?.substring(0, 200) || "This is why it's important.",
        "Remember this when the situation arises.",
      ],
    };
  }

  return {
    title: result.title,
    subtitle: result.subtitle || "This week's practice",
    body: result.body,
  };
}

export default { practitioner, selectRandomPractice };