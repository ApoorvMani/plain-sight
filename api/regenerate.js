import { CORS_HEADERS } from "./agents/_shared.js";
import { scout } from "./agents/scout.js";
import { editor } from "./agents/editor.js";
import { storyteller } from "./agents/storyteller.js";
import { mythKeeper } from "./agents/myth-keeper.js";
import { practitioner } from "./agents/practitioner.js";
import { subEditor } from "./agents/sub-editor.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1kb",
    },
  },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

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

function findById(scoutResult, id) {
  const all = [...(scoutResult.live || []), ...(scoutResult.fallback || [])];
  return all.find((item) => item.id === id) || all[0];
}

async function runPipeline(req, res) {
  const region = req.body?.region || "United Kingdom";
  const timeoutMs = 90000;
  const startTime = Date.now();

  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  sendEvent(res, "pipeline_start", { region, timestamp: startTime });

  let currentAgent = "unknown";
  let scoutResult = null;
  let editorChoice = null;

  try {
    currentAgent = "scout";
    sendEvent(res, "agent_start", { agent: "scout", message: "Reading UK threat sources..." });

    scoutResult = await scout({ region });
    sendEvent(res, "agent_complete", {
      agent: "scout",
      summary: `Found ${scoutResult.total_candidates} candidates. Sources: AF=${scoutResult.source_status.action_fraud}, NCSC=${scoutResult.source_status.ncsc}, NewsAPI=${scoutResult.source_status.newsapi}`,
      output: scoutResult,
    });

    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Timeout exceeded at scout stage");
    }

    currentAgent = "editor";
    sendEvent(res, "agent_start", { agent: "editor", message: "Choosing today's stories..." });

    const candidatesForEditor = scoutResult.live.length >= 4
      ? scoutResult.live
      : scoutResult.live.concat(scoutResult.fallback).slice(0, 8);
    editorChoice = await editor(candidatesForEditor);
    sendEvent(res, "agent_complete", {
      agent: "editor",
      summary: editorChoice.editorial_note,
      output: editorChoice,
    });

    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Timeout exceeded at editor stage");
    }

    const stories = [];
    const chosen = [editorChoice.lead_id, ...(editorChoice.secondary_ids || [])];

    for (let i = 0; i < chosen.length; i++) {
      const isLead = i === 0;
      currentAgent = "storyteller";
      sendEvent(res, "agent_start", {
        agent: "storyteller",
        message: `Writing story ${i + 1} of 4...`,
        story_index: i,
      });

      const rawStory = findById(scoutResult, chosen[i]);
      const written = await storyteller({ raw: rawStory, is_lead: isLead });
      stories.push(written);
      sendEvent(res, "agent_progress", {
        agent: "storyteller",
        story_index: i,
        output: written,
      });

      if (Date.now() - startTime > timeoutMs) {
        throw new Error("Timeout exceeded at storyteller stage");
      }
    }

    sendEvent(res, "agent_complete", {
      agent: "storyteller",
      summary: "Stories written.",
    });

    currentAgent = "myth_keeper";
    sendEvent(res, "agent_start", { agent: "myth_keeper", message: "Choosing this edition's myth..." });

    const myth = await mythKeeper();
    sendEvent(res, "agent_complete", {
      agent: "myth_keeper",
      summary: myth.myth_statement,
      output: myth,
    });

    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Timeout exceeded at myth_keeper stage");
    }

    currentAgent = "practitioner";
    sendEvent(res, "agent_start", { agent: "practitioner", message: "Writing this week's practice..." });

    const practice = await practitioner();
    sendEvent(res, "agent_complete", {
      agent: "practitioner",
      summary: practice.title,
      output: practice,
    });

    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Timeout exceeded at practitioner stage");
    }

    const draft = {
      edition_date: new Date().toISOString().slice(0, 10),
      edition_iso: new Date().toISOString(),
      region,
      lead_story: stories[0] || null,
      secondary_stories: stories.slice(1) || [],
      myth: myth || null,
      practice: practice || null,
    };

    currentAgent = "sub_editor";
    sendEvent(res, "agent_start", { agent: "sub_editor", message: "Final pass..." });

    const final = await subEditor(draft);
    sendEvent(res, "agent_complete", {
      agent: "sub_editor",
      summary: "Edition ready.",
    });

    sendEvent(res, "edition_ready", { edition: final });

    console.log(`Pipeline completed in ${Date.now() - startTime}ms`);
    res.end();
  } catch (error) {
    console.error("Pipeline error:", error.message);

    sendEvent(res, "error", {
      message: error.message,
      agent: currentAgent,
      stage: "complete what we have",
    });

    res.end();
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

  return runPipeline(req, res);
}