import { callClaude, safeJsonParse } from "./agents/_shared.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10kb",
    },
  },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SYSTEM_PROMPT = `You are generating 3 scam-detection scenarios for a UK reader. Each scenario is a single piece of communication the reader might receive. Produce exactly 3 scenarios in randomised order, with a mix of formats: one SMS, one voicemail (as a transcript), one browser popup. Mix scams and legitimate ones — at least 1 scam, at least 1 legitimate, the third is your call. Use realistic 2026 UK contexts. For scams, identify the manipulation tactic. For legitimate ones, identify what makes them trustworthy.

Output ONLY valid JSON:
{
  "scenarios": [
    {
      "id": 1,
      "format": "sms" | "voicemail" | "popup",
      "content": "string — what the user reads/hears, written naturally for that format",
      "is_scam": boolean,
      "tactic": "urgency" | "authority" | "fear" | "greed" | "curiosity" | "legitimate",
      "explanation": "string — 2 sentences plain English. Name the tactic in friendly language ('they're trying to rush you' rather than 'urgency-based social engineering')."
    },
    ... 3 total
  ]
}
NO jargon. NO 'sophisticated' or 'threat actor' or 'social engineering'. Plain English only.`;

const FALLBACK_SCENARIOS = {
  scenarios: [
    {
      id: 1,
      format: "sms",
      content: "From: +44 7700 900123 — Your bank has locked your account. Call 0800 123 4567 immediately to avoid your account being closed. Do not ignore this message.",
      is_scam: true,
      tactic: "fear",
      explanation: "Banks never text you asking you to call a number. This is trying to frighten you into acting fast without thinking."
    },
    {
      id: 2,
      format: "voicemail",
      content: "Hi, this is Dr. Patel from your GP surgery. We're calling to remind you that your prescription is ready for collection at your pharmacy. Please let us know if you have any questions. Thanks.",
      is_scam: false,
      tactic: "legitimate",
      explanation: "A genuine NHS voicemail. It doesn't ask for personal details, payment, or urgent action — just a reminder to pick up your prescription."
    },
    {
      id: 3,
      format: "popup",
      content: "[Browser Popup] Your computer may be at risk! Click here to run a free security scan and protect your data. Do not close this window.",
      is_scam: true,
      tactic: "urgency",
      explanation: "Browser popups telling you your computer is at risk are almost always scams. Real warnings never pop up while you're browsing."
    }
  ]
};

async function generateScenarios() {
  try {
    const result = await callClaude(
      SYSTEM_PROMPT,
      "Generate 3 scam detection scenarios.",
      1500
    );

    const parsed = safeJsonParse(result);
    
    if (parsed && parsed.scenarios && Array.isArray(parsed.scenarios) && parsed.scenarios.length === 3) {
      return parsed;
    }

    throw new Error("Invalid response format");
  } catch (e) {
    console.warn("Scenario generation failed, trying once more:", e.message);
    
    try {
      const result = await callClaude(
        SYSTEM_PROMPT,
        "Generate 3 scam detection scenarios.",
        1500
      );

      const parsed = safeJsonParse(result);
      
      if (parsed && parsed.scenarios && Array.isArray(parsed.scenarios) && parsed.scenarios.length === 3) {
        return parsed;
      }
    } catch (e2) {
      console.error("Scenario generation retry failed:", e2.message);
    }

    return FALLBACK_SCENARIOS;
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const scenarios = await generateScenarios();
    
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).json(scenarios);
  } catch (error) {
    console.error("Error in sim-scam:", error.message);
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({ error: "Failed to generate scenarios" });
  }
}