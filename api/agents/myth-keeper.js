import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { callClaude, safeJsonParse } from "./_shared.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MYTH_BANK_PATH = path.join(__dirname, "..", "..", "data", "myth-bank.json");

const SYSTEM_PROMPT = `You are the Myth-keeper of Plain Sight. You've selected a cybersecurity myth from your researched bank. Your job is to expand the brief seed into a 2-paragraph debunk in plain English with a calm, non-judgmental tone. Most readers have believed this myth themselves. Never make them feel stupid. Always end with a single 'what to do' line — a concrete action they can take in under 60 seconds. Output ONLY valid JSON: {"myth_statement": string (the myth as people say it), "verdict": "FALSE"|"PARTLY TRUE"|"OUTDATED", "explanation": [string, string], "what_to_do": string}. The myth seed: [INJECTED]`;

function loadMythBank() {
  try {
    const data = fs.readFileSync(MYTH_BANK_PATH, "utf8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to load myth bank:", e);
    return [];
  }
}

function selectRandomMyth() {
  const myths = loadMythBank();
  if (myths.length === 0) {
    return {
      id: "myth-default",
      myth: "I'd know if I'd been hacked",
      verdict: "FALSE",
      explanation_seed: "Modern attackers want to stay hidden. The most damaging breaches are the ones you don't notice.",
    };
  }
  const index = Math.floor(Math.random() * myths.length);
  return myths[index];
}

export async function mythKeeper() {
  const selectedMyth = selectRandomMyth();

  const mythJson = JSON.stringify(selectedMyth, null, 2);
  let result;

  try {
    result = await callClaude(
      SYSTEM_PROMPT,
      `Expand this myth seed into a Plain Sight debunk:\n${mythJson}`,
      1500
    );
  } catch (e) {
    console.error("MythKeeper call failed:", e.message);
    throw e;
  }

  if (!result || typeof result !== "object") {
    const parsed = safeJsonParse(result);
    if (!parsed) {
      throw new Error("MythKeeper returned invalid JSON");
    }
    result = parsed;
  }

  if (!result.myth_statement || !result.explanation || !Array.isArray(result.explanation)) {
    console.warn("MythKeeper returned incomplete result");
    result = {
      myth_statement: selectedMyth.myth,
      verdict: selectedMyth.verdict,
      explanation: [
        selectedMyth.explanation_seed?.substring(0, 200) || "This myth is false.",
        "The truth is more nuanced than people assume.",
      ],
      what_to_do: "Check haveibeenpwned.com for your main email address.",
    };
  }

  return {
    myth_statement: result.myth_statement,
    verdict: result.verdict,
    explanation: result.explanation,
    what_to_do: result.what_to_do,
  };
}

export default { mythKeeper, selectRandomMyth };