const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You are a cybersecurity analyst examining a URL for phishing indicators. Output ONLY valid JSON: {"verdict": "likely_safe" | "suspicious" | "likely_phishing", "reasons": ["plain English reason 1", "plain English reason 2"], "plain_explanation": "a 1-sentence summary in calm plain English"}. Never give legal advice. Never claim certainty. If unsure, return "suspicious" with reasons. The URL is: `;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "2kb",
    },
  },
};

function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body || {};
  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: "Please enter a valid URL." });
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
        system: SYSTEM_PROMPT + url,
        messages: [{ role: "user", content: "Analyse this URL." }],
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

  const safeVerdicts = ["likely_safe", "suspicious", "likely_phishing"];
  if (!safeVerdicts.includes(result.verdict)) {
    result.verdict = "suspicious";
  }

  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  return res.status(200).json(result);
}