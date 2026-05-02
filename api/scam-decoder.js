const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You are analysing a message a UK reader received and is unsure about. Identify whether it shows hallmarks of a scam. Output ONLY valid JSON: {"verdict": "likely_scam" | "probably_legit" | "unclear", "tactic": "urgency | authority | fear | greed | curiosity | none", "plain_explanation": "calm 2-sentence explanation", "what_to_do": "one specific action"}. Never tell the reader to ignore advice from real institutions. If the message references a real UK organisation (HMRC, Royal Mail, NHS, banks), be especially careful — most are scams, but acknowledge the small possibility of legitimacy. The message is: `;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10kb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body || {};
  if (!message || message.trim().length < 10) {
    return res.status(400).json({ error: "Please paste a longer message to analyse." });
  }

  let anthropicResponse;
  try {
    anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 500,
        system: SYSTEM_PROMPT + message,
        messages: [{ role: "user", content: "Analyse this message." }],
      }),
    });
  } catch (e) {
    console.error("Anthropic API error:", e);
    return res.status(502).json({ error: "Analysis unavailable. Try again shortly." });
  }

  if (!anthropicResponse.ok) {
    console.error("Anthropic API error:", anthropicResponse.status);
    return res.status(502).json({ error: "Analysis unavailable. Try again." });
  }

  let result;
  try {
    const data = await anthropicResponse.json();
    const text = data.content?.[0]?.text || "";

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        return res.status(500).json({ error: "Could not parse analysis result." });
      }
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr, text);
      return res.status(500).json({ error: "Could not parse analysis result." });
    }
  } catch (e) {
    console.error("Response parse error:", e);
    return res.status(502).json({ error: "Analysis unavailable. Try again." });
  }

  const safeVerdicts = ["likely_scam", "probably_legit", "unclear"];
  if (!safeVerdicts.includes(result.verdict)) {
    result.verdict = "unclear";
  }

  const safeTactics = ["urgency", "authority", "fear", "greed", "curiosity", "none"];
  if (!safeTactics.includes(result.tactic)) {
    result.tactic = "none";
  }

  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  return res.status(200).json(result);
}