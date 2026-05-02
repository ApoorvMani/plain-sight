import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ACTION_FRAUD_RSS = "https://www.actionfraud.police.uk/news.xml";
const NCSC_RSS = "https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml";
const FALLBACK_PATH = path.join(__dirname, "..", "..", "data", "fallback-threats.json");

async function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Plain Sight/1.0",
      },
    });

    clearTimeout(timeout);
    return response;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

function parseActionFraudRss(xmlText) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemText = match[1];

    const titleMatch = itemText.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
    const descMatch = itemText.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/);
    const pubMatch = itemText.match(/<pubDate>(.*?)<\/pubDate>/);

    const title = titleMatch ? (titleMatch[1] || titleMatch[2] || "").trim() : "";
    const description = descMatch ? (descMatch[1] || descMatch[2] || "").trim() : "";
    const pubDate = pubMatch ? pubMatch[1].trim() : "";

    if (title && description) {
      items.push({
        id: `af-${Date.now()}-${items.length}`,
        raw_headline: title.substring(0, 150),
        raw_summary: description.replace(/<[^>]+>/g, "").substring(0, 300),
        category: "other",
        uk_context: "Action Fraud report",
        severity: "MEDIUM",
        freshness: "weekly",
        source_url: "Action Fraud",
      });
    }

    if (items.length >= 5) break;
  }

  return items;
}

function parseNcscRss(xmlText) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemText = match[1];

    const titleMatch = itemText.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
    const descMatch = itemText.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/);

    const title = titleMatch ? (titleMatch[1] || titleMatch[2] || "").trim() : "";
    const description = descMatch ? (descMatch[1] || descMatch[2] || "").trim() : "";

    if (title && description) {
      items.push({
        id: `ncsc-${Date.now()}-${items.length}`,
        raw_headline: title.substring(0, 150),
        raw_summary: description.replace(/<[^>]+>/g, "").substring(0, 300),
        category: "other",
        uk_context: "NCSC alert",
        severity: "MEDIUM",
        freshness: "weekly",
        source_url: "NCSC",
      });
    }

    if (items.length >= 5) break;
  }

  return items;
}

function loadFallbackThreats() {
  try {
    const data = fs.readFileSync(FALLBACK_PATH, "utf8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to load fallback threats:", e);
    return [];
  }
}

function selectWeightedFallbacks(allThreats, count = 8) {
  const weighted = allThreats.map((t) => {
    let weight = 1;
    if (t.freshness === "breaking") weight = 3;
    if (t.freshness === "weekly") weight = 2;
    return { ...t, weight };
  });

  const selected = [];
  const usedIndices = new Set();

  for (let i = 0; i < weight * 3; i++) {
    const available = weighted
      .map((t, idx) => ({ ...t, originalIndex: idx }))
      .filter((t) => !usedIndices.has(t.originalIndex) && t.weight > 0);

    if (available.length === 0) break;

    const totalWeight = available.reduce((sum, t) => sum + t.weight, 0);
    let random = Math.random() * totalWeight;

    for (const item of available) {
      random -= item.weight;
      if (random <= 0) {
        selected.push(item);
        usedIndices.add(item.originalIndex);
        break;
      }
    }

    if (selected.length >= count) break;
  }

  return selected.slice(0, count);
}

export async function scout({ region = "United Kingdom" }) {
  let actionFraudItems = [];
  let ncscItems = [];
  let actionFraudStatus = "failed";
  let ncscStatus = "failed";

  try {
    const afResponse = await fetchWithTimeout(ACTION_FRAUD_RSS, 5000);
    if (afResponse.ok) {
      const xmlText = await afResponse.text();
      actionFraudItems = parseActionFraudRss(xmlText);
      actionFraudStatus = "ok";
    }
  } catch (e) {
    console.warn("Action Fraud fetch failed:", e.message);
  }

  try {
    const ncscResponse = await fetchWithTimeout(NCSC_RSS, 5000);
    if (ncscResponse.ok) {
      const xmlText = await ncscResponse.text();
      ncscItems = parseNcscRss(xmlText);
      ncscStatus = "ok";
    }
  } catch (e) {
    console.warn("NCSC fetch failed:", e.message);
  }

  const allFallbacks = loadFallbackThreats();
  const selectedFallbacks = selectWeightedFallbacks(allFallbacks, 8);

  const live = [...actionFraudItems, ...ncscItems].slice(0, 10);
  const fallback = selectedFallbacks;

  return {
    live,
    fallback,
    total_candidates: live.length + fallback.length,
    source_status: {
      action_fraud: actionFraudStatus,
      ncsc: ncscStatus,
    },
  };
}

export default { scout };