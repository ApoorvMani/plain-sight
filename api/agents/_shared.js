const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export const MODEL = "claude-sonnet-4-5";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function safeJsonParse(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  let cleaned = text.trim();

  const codeBlockMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1];
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

async function callClaude(systemPrompt, userMessage, maxTokens = 1000) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Claude API error:", response.status, errorText);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || "";

  if (!text) {
    throw new Error("Empty response from Claude");
  }

  const parsed = safeJsonParse(text);
  if (parsed) {
    return parsed;
  }

  return text;
}

module.exports = {
  MODEL,
  CORS_HEADERS,
  safeJsonParse,
  callClaude,
};

export {
  MODEL,
  CORS_HEADERS,
  safeJsonParse,
  callClaude,
};