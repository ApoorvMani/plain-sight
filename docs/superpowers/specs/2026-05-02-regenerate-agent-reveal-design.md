# Prompt A — Regenerate Button, Agent Ribbon & Judge Topic
**Date:** 2026-05-02  
**Estimated effort:** ~45 min  
**Status:** Approved

---

## Overview

Adds a live-generation experience to the Plain Sight edition page:

- A **Regenerate bar** below the masthead lets any user re-run the six-agent pipeline on demand.
- An **agent ribbon** reveals the pipeline's six stages lighting up sequentially as each agent starts and completes.
- A **LIVE indicator** pulses during generation.
- The **lead story renders word-by-word** (typewriter effect) as the storyteller's output arrives.
- A **special edition banner** appears when a judge or user provides a topic string.
- The **backend accepts an optional `topic` param** that routes the lead story directly to the storyteller, bypassing scout/editor for that slot.

---

## Decisions

| Question | Decision |
|---|---|
| Word-by-word rendering | Typewriter effect on completed text (not real token streaming) |
| Topic fast-path | Lead bypasses scout/editor; synthetic raw story sent to storyteller. Scout + editor still run for secondaries. |
| Special edition treatment | Full-width banner strip: cream background, 1px coral hairline underline only |
| Agent ribbon style | Plain text labels + middots; state via opacity + 1px coral underline growing beneath active label. No pills, no backgrounds. |
| Page load behaviour | Cache-first: page still loads `data/today.json` on load. Regenerate is a manual secondary action. |

---

## HTML Additions (`index.html`)

Three blocks inserted between `</header>` and `<main class="publication">`, in this order:

### 1. Regenerate bar
```html
<div class="regenerate-bar" id="regenerate-bar">
  <input type="text" id="topic-input" class="topic-input"
         placeholder="Special edition topic — leave blank for today's news" />
  <button id="regenerate-btn" class="regenerate-btn" type="button">Regenerate</button>
</div>
```
Always visible. Uses existing design tokens (Inter, `--color-accent`, `--color-border`).

### 2. Agent ribbon
```html
<div class="agent-ribbon" id="agent-ribbon" aria-hidden="true">
  <span class="live-indicator" id="live-indicator">
    <span class="live-dot"></span>LIVE
  </span>
  <span class="agent-label" data-agent="scout">Scout</span>
  <span class="agent-label" data-agent="editor">Editor</span>
  <span class="agent-label" data-agent="storyteller">Storyteller</span>
  <span class="agent-label" data-agent="myth_keeper">Myth-Keeper</span>
  <span class="agent-label" data-agent="practitioner">Practitioner</span>
  <span class="agent-label" data-agent="sub_editor">Sub-Editor</span>
</div>
```
Hidden by default (`opacity: 0; pointer-events: none`). Labels separated by middots in CSS (`::after` pseudo-element). LIVE dot at left edge.

### 3. Special edition banner (JS-injected)
Injected by `RegenerateController` immediately before `<main class="publication">` only when a topic is present. Removed on next page load (it is not persisted to the DOM).
```html
<div class="special-edition-banner" id="special-edition-banner">
  Special edition on: <strong>[topic]</strong>
</div>
```

---

## CSS (`styles.css`)

### Regenerate bar
```css
.regenerate-bar {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
  align-items: center;
}
.topic-input {
  flex: 1;
  font-family: var(--font-sans);
  font-size: 0.875rem;
  border: 1px solid var(--color-border);
  background: transparent;
  padding: var(--space-xs) var(--space-sm);
  color: var(--color-body);
}
.regenerate-btn {
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: transparent;
  border: 1px solid var(--color-accent);
  padding: var(--space-xs) var(--space-md);
  cursor: pointer;
}
.regenerate-btn:disabled { opacity: 0.4; cursor: not-allowed; }
```

### Agent ribbon
```css
.agent-ribbon {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  font-family: var(--font-sans);
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--transition-normal);
  margin-bottom: var(--space-lg);
}
.agent-ribbon.is-visible { opacity: 1; pointer-events: auto; }

/* Middot separators between labels (::before on following sibling) */
.agent-label + .agent-label::before {
  content: '·';
  margin-right: var(--space-md);
  color: var(--color-border);
}

.agent-label {
  opacity: 0.3;
  position: relative;
  transition: opacity var(--transition-fast);
  padding-bottom: 2px;
}
.agent-label.is-active {
  opacity: 1;
  color: var(--color-accent);
}
.agent-label.is-active::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0;
  width: 100%;
  height: 1px;
  background: var(--color-accent);
  transform: scaleX(0);
  transform-origin: left;
  animation: underline-grow 300ms ease forwards;
}
.agent-label.is-done {
  opacity: 0.6;
  color: var(--color-accent);
}
.agent-label.is-done::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0;
  width: 100%;
  height: 1px;
  background: var(--color-accent);
}
@keyframes underline-grow {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
```

### LIVE indicator
```css
.live-indicator {
  display: none;
  align-items: center;
  gap: 4px;
  color: var(--color-accent);
  font-weight: 500;
}
.live-indicator.is-visible { display: flex; }
.live-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: live-pulse 1.2s ease-in-out infinite;
}
@keyframes live-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.75); }
}
```

### Special edition banner
```css
.special-edition-banner {
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  color: var(--color-body-light);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--color-accent);
  margin-bottom: var(--space-lg);
}
```

---

## Backend (`api/regenerate.js`)

### New param
```js
const topic = req.body?.topic?.trim() || null;
```
Read alongside existing `region`.

### Synthetic lead story (when topic present)
Constructed before the storyteller loop:
```js
const topicLead = topic ? {
  id: "topic-lead",
  raw_headline: topic,
  raw_summary: `Write a Plain Sight briefing for ordinary UK readers about: ${topic}`,
  category: "general",
  severity: "MEDIUM",
  source_name: null,
  source_url: null,
} : null;
```

### Storyteller loop change
Single-line change to the raw story selection at `i === 0`:
```js
const rawStory = (topicLead && i === 0) ? topicLead : findById(scoutResult, chosen[i]);
```
Scout and Editor still run in full — their output provides the three secondary story IDs.

### `pipeline_start` event
Add `topic` to the SSE payload so the frontend can show the banner:
```js
sendEvent(res, "pipeline_start", { region, topic: topic || null, timestamp: startTime });
```

No other backend changes. `bodyParser` size limit of `1kb` is sufficient for a topic string.

---

## Frontend (`main.js`) — `RegenerateController`

A new module object added to the existing IIFE, parallel to `EditorDesk`. Called as `RegenerateController.init()` in `DOMContentLoaded`.

### Streaming

Uses `fetch` + `response.body.getReader()` (ReadableStream). A UTF-8 TextDecoder accumulates bytes into a string buffer; each flush is split on `\n` to reconstruct named SSE events by tracking `event:` and `data:` lines together. `EventSource` is not used because the endpoint is POST.

```js
// Pseudocode for the pump loop
function pump() {
  reader.read().then(function(chunk) {
    if (chunk.done) { self._onDone(); return; }
    buffer += decoder.decode(chunk.value, { stream: true });
    var lines = buffer.split('\n');
    buffer = lines.pop(); // hold incomplete line
    lines.forEach(function(line) {
      if (line.startsWith('event: ')) { currentEvent = line.slice(7).trim(); }
      else if (line.startsWith('data: ') && currentEvent) {
        try { self._handleEvent(currentEvent, JSON.parse(line.slice(6))); } catch(e) {}
        currentEvent = null;
      }
    });
    pump();
  });
}
```

### Event handling

| SSE event | Action |
|---|---|
| `pipeline_start` | Show ribbon (`is-visible`); show LIVE dot; inject banner if `data.topic`; replace all four content slots with loading placeholder text; disable button. Do NOT null `editionData` — leave existing edition accessible. |
| `agent_start` | Ribbon label matching `data.agent` → add `is-active` class |
| `agent_complete` | Ribbon label → remove `is-active`, add `is-done` |
| `agent_progress` | `story_index === 0`: call `renderLeadStory(data.output)`, typewriter headline + body; update `editionData.lead_story`. `story_index > 0`: push to `_storyBuffer`, call `renderSecondaryStories(_storyBuffer)`; update `editionData.secondary_stories`. No typewriter on secondaries. |
| `edition_ready` | Call `renderMythColumn` + `renderWeeklyPractice`; replace `editionData` with full `data.edition`; hide LIVE dot; re-enable button |
| `error` | Hide LIVE dot; show error message in `#lead-story` slot; re-enable button |

### `editionData` lifecycle
- Not nulled at `pipeline_start` — existing edition remains for Editor's Desk mid-pipeline.
- Partially updated as stories arrive (`editionData.lead_story` after `agent_progress idx 0`; `editionData.secondary_stories` as `_storyBuffer` fills). Guard with `if (editionData)` before writing — `today.json` may have failed to load on page open, leaving `editionData` null.
- Fully replaced by `edition_ready` payload.

### Typewriter

```js
function _typewriter(el, text, wps, onDone) {
  var words = text.split(' ');
  var i = 0;
  el.textContent = '';
  var base = 1000 / wps;
  (function tick() {
    if (i >= words.length) { if (onDone) onDone(); return; }
    el.textContent += (i > 0 ? ' ' : '') + words[i++];
    setTimeout(tick, base + (Math.random() * 10 - 5)); // ±5ms jitter
  })();
}
```

**Lead headline:** 20 wps  
**Lead body paragraphs:** 35 wps, chained sequentially (paragraph N+1 starts in `onDone` of paragraph N)  
**Secondary stories:** no typewriter — instant render

### State
- `_isRunning` flag prevents double-clicks.
- `_storyBuffer = []` reset at each pipeline start.
- Button re-enabled on `edition_ready` or `error`.

---

## Error handling

- If `response.body` is unavailable (older browser): fall back to `response.text()` and process events after full load — ribbon and typewriter are skipped but edition still renders.
- If `edition_ready` never fires but stream ends: `_onDone()` re-enables the button and leaves partial content visible.
- On network error: error shown in `#lead-story` slot.

---

## Files changed

| File | Change |
|---|---|
| `index.html` | Add regenerate bar, agent ribbon, LIVE indicator |
| `styles.css` | Add ribbon, LIVE, banner, regenerate-bar styles |
| `main.js` | Add `RegenerateController` object; call `init()` in DOMContentLoaded |
| `api/regenerate.js` | Read `topic` param; inject synthetic lead; add `topic` to `pipeline_start` SSE event |
