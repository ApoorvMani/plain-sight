# Regenerate Button, Agent Ribbon & Judge Topic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live pipeline-generation UI — Regenerate button, streaming agent ribbon, LIVE indicator, typewriter lead story, and optional judge-topic override that bypasses scout/editor for the lead.

**Architecture:** `RegenerateController` is a new object inserted into the existing `main.js` IIFE (after `showEditionPendingMessage`, before `loadEdition`). It POSTs to `/api/regenerate`, reads the SSE stream via `fetch` + `ReadableStream.getReader()`, parses named SSE events progressively, updates the ribbon, renders stories as they arrive, and runs a typewriter effect on the lead. The backend gains a `topic` param that short-circuits the lead through a synthetic raw story directly to the storyteller; scout and editor still run for secondaries.

**Tech Stack:** Vanilla JS (ES5 patterns inside existing IIFE), CSS custom properties, SSE via `fetch` + `ReadableStream.getReader()`, Vercel serverless (Node.js ESM)

---

## File Map

| File | What changes |
|---|---|
| `api/regenerate.js` | Read `topic` param; build `topicLead`; add `topic` to `pipeline_start`; swap raw story at `i === 0` |
| `index.html` | Insert regenerate bar + agent ribbon between `</header>` and `<main>` |
| `styles.css` | Append regenerate-bar, agent-ribbon, LIVE indicator, special-edition-banner styles |
| `main.js` | Insert `RegenerateController` object after `showEditionPendingMessage`; add `.init()` call in `DOMContentLoaded` |

---

### Task 1: Add topic param and fast-path lead to the backend

**Files:**
- Modify: `api/regenerate.js`

- [ ] **Step 1: Read `topic` from request body**

In `runPipeline`, immediately after `const region = req.body?.region || "United Kingdom";` (line 59), add:

```js
const topic = req.body?.topic?.trim() || null;
```

- [ ] **Step 2: Add `topic` to the `pipeline_start` SSE event**

Replace:
```js
sendEvent(res, "pipeline_start", { region, timestamp: startTime });
```
With:
```js
sendEvent(res, "pipeline_start", { region, topic: topic || null, timestamp: startTime });
```

- [ ] **Step 3: Build the synthetic lead before the storyteller loop**

After `const stories = [];` and before the `for` loop (around line 106), add:

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

- [ ] **Step 4: Override the raw story for the lead when topic is present**

Inside the storyteller `for` loop, replace:
```js
const rawStory = findById(scoutResult, chosen[i]);
```
With:
```js
const rawStory = (topicLead && i === 0) ? topicLead : findById(scoutResult, chosen[i]);
```

- [ ] **Step 5: Smoke-test with curl (requires `vercel dev` running)**

```bash
curl -s -X POST http://localhost:3000/api/regenerate \
  -H "Content-Type: application/json" \
  -d '{"topic":"USB charging cables stealing your data"}' | head -20
```

Expected output starts with:
```
event: pipeline_start
data: {"region":"United Kingdom","topic":"USB charging cables stealing your data","timestamp":...}
```

- [ ] **Step 6: Commit**

```bash
git add api/regenerate.js
git commit -m "feat: add topic param and fast-path lead to regenerate pipeline"
```

---

### Task 2: Add HTML structure

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Insert regenerate bar and agent ribbon between `</header>` and `<!-- Main Content -->`**

Find this in `index.html` (around line 26):
```html
    </header>

    <!-- Main Content -->
```

Replace with:
```html
    </header>

    <!-- Regenerate Bar -->
    <div class="regenerate-bar" id="regenerate-bar">
      <input type="text" id="topic-input" class="topic-input"
             placeholder="Special edition topic — leave blank for today's news" />
      <button id="regenerate-btn" class="regenerate-btn" type="button">Regenerate</button>
    </div>

    <!-- Agent Ribbon -->
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

    <!-- Main Content -->
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add regenerate bar and agent ribbon HTML"
```

---

### Task 3: Add CSS

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Append all new rules to the end of `styles.css`**

```css
/* ============================================
   REGENERATE BAR
   ============================================ */
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
  border-radius: 0;
  background: transparent;
  padding: var(--space-xs) var(--space-sm);
  color: var(--color-body);
  outline: none;
}

.topic-input:focus {
  border-color: var(--color-accent);
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
  white-space: nowrap;
  transition: opacity var(--transition-fast);
}

.regenerate-btn:hover {
  opacity: 0.75;
}

.regenerate-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ============================================
   AGENT RIBBON
   ============================================ */
.agent-ribbon {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  font-family: var(--font-sans);
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--transition-normal);
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
}

.agent-ribbon.is-visible {
  opacity: 1;
  pointer-events: auto;
}

/* Middot separators between labels (::before on following sibling) */
.agent-label + .agent-label::before {
  content: '\00b7';
  margin-right: var(--space-md);
  color: var(--color-border);
}

.agent-label {
  opacity: 0.3;
  position: relative;
  transition: opacity var(--transition-fast), color var(--transition-fast);
  padding-bottom: 2px;
  color: var(--color-body-light);
}

.agent-label.is-active {
  opacity: 1;
  color: var(--color-accent);
}

.agent-label.is-active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
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
  bottom: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: var(--color-accent);
}

@keyframes underline-grow {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}

/* ============================================
   LIVE INDICATOR
   ============================================ */
.live-indicator {
  display: none;
  align-items: center;
  gap: 4px;
  color: var(--color-accent);
  font-weight: 500;
  margin-right: var(--space-sm);
}

.live-indicator.is-visible {
  display: flex;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: live-pulse 1.2s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes live-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.75); }
}

/* ============================================
   SPECIAL EDITION BANNER
   ============================================ */
.special-edition-banner {
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  color: var(--color-body-light);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--color-accent);
  margin-bottom: var(--space-lg);
}
```

- [ ] **Step 2: Open the page in a browser (static open or `vercel dev`) and confirm:**
  - Regenerate bar appears below masthead, above lead story
  - Input and button use correct tokens (cream background, coral border on button)
  - Agent ribbon is invisible (opacity 0)

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat: add regenerate-bar, agent-ribbon, LIVE indicator, and banner CSS"
```

---

### Task 4: Add RegenerateController to main.js

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Insert the complete `RegenerateController` object**

Find `showEditionPendingMessage` (around line 1000):

```js
  function showEditionPendingMessage() {
    var dateEl = document.getElementById('current-date');
    if (dateEl) {
      dateEl.textContent = "Today's edition is being prepared.";
      dateEl.classList.add('edition-pending');
    }
  }
```

Immediately after its closing `}` and before the `/* FETCH AND RENDER EDITION */` comment block, insert:

```js
  /* ============================================
     REGENERATE CONTROLLER
     ============================================ */
  var RegenerateController = {
    _btn: null,
    _topicInput: null,
    _ribbon: null,
    _liveIndicator: null,
    _isRunning: false,
    _storyBuffer: [],

    init: function() {
      this._btn = document.getElementById('regenerate-btn');
      this._topicInput = document.getElementById('topic-input');
      this._ribbon = document.getElementById('agent-ribbon');
      this._liveIndicator = document.getElementById('live-indicator');

      var self = this;
      if (this._btn) {
        this._btn.addEventListener('click', function() {
          if (self._isRunning) return;
          var topic = self._topicInput ? self._topicInput.value.trim() : '';
          self._start(topic);
        });
      }
    },

    _start: function(topic) {
      var self = this;
      this._isRunning = true;
      this._storyBuffer = [];

      if (this._btn) this._btn.disabled = true;
      this._showRibbon();
      this._setLive(true);
      this._clearEdition();

      if (topic) {
        this._showBanner(topic);
      }

      fetch(API_BASE + '/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: 'United Kingdom', topic: topic || undefined })
      })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Pipeline unavailable (' + response.status + ')');
        }

        if (response.body && response.body.getReader) {
          var reader = response.body.getReader();
          var decoder = new TextDecoder();
          var buffer = '';
          var currentEvent = null;

          function pump() {
            return reader.read().then(function(chunk) {
              if (chunk.done) {
                self._onDone();
                return;
              }
              buffer += decoder.decode(chunk.value, { stream: true });
              var lines = buffer.split('\n');
              buffer = lines.pop();

              lines.forEach(function(line) {
                if (line.startsWith('event: ')) {
                  currentEvent = line.slice(7).trim();
                } else if (line.startsWith('data: ') && currentEvent) {
                  try {
                    var data = JSON.parse(line.slice(6));
                    self._handleEvent(currentEvent, data);
                  } catch (e) {}
                  currentEvent = null;
                }
              });

              return pump();
            });
          }

          return pump();
        }

        // Fallback for environments without ReadableStream
        return response.text().then(function(text) {
          var lines = text.split('\n');
          var currentEvent = null;
          lines.forEach(function(line) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ') && currentEvent) {
              try {
                var data = JSON.parse(line.slice(6));
                self._handleEvent(currentEvent, data);
              } catch (e) {}
              currentEvent = null;
            }
          });
          self._onDone();
        });
      })
      .catch(function(e) {
        console.error('[RegenerateController] fetch error:', e);
        var slot = document.getElementById('lead-story');
        if (slot) {
          slot.innerHTML = '<p class="placeholder-text">Something went wrong. Try again?</p>';
        }
        self._onDone();
      });
    },

    _handleEvent: function(eventName, data) {
      switch (eventName) {
        case 'agent_start':
          this._setAgentActive(data.agent);
          break;
        case 'agent_complete':
          this._setAgentDone(data.agent);
          break;
        case 'agent_progress':
          this._onStoryProgress(data);
          break;
        case 'edition_ready':
          this._onEditionReady(data.edition);
          break;
        case 'error':
          var slot = document.getElementById('lead-story');
          if (slot) {
            slot.innerHTML = '<p class="placeholder-text">' +
              escapeHtml(data.message || 'Pipeline error. Try again?') + '</p>';
          }
          this._onDone();
          break;
      }
    },

    _onStoryProgress: function(data) {
      var story = data.output;
      var idx = data.story_index;

      if (idx === 0) {
        renderLeadStory(story);
        if (editionData) editionData.lead_story = story;
        this._typewriterLead();
      } else {
        this._storyBuffer.push(story);
        renderSecondaryStories(this._storyBuffer);
        if (editionData) editionData.secondary_stories = this._storyBuffer.slice();
      }
    },

    _typewriterLead: function() {
      var self = this;
      var container = document.getElementById('lead-story');
      if (!container) return;

      var headline = container.querySelector('.story-headline');
      if (!headline) return;

      // Capture and blank the headline, then type it in
      var headlineText = headline.textContent;
      headline.textContent = '';

      self._typewriter(headline, headlineText, 20, function() {
        // Capture and blank all classless body paragraphs, then chain typewriter
        var bodyParas = Array.prototype.slice.call(
          container.querySelectorAll('p:not([class])')
        );
        var texts = bodyParas.map(function(p) {
          var t = p.textContent;
          p.textContent = '';
          return t;
        });

        function chainParas(index) {
          if (index >= bodyParas.length) return;
          self._typewriter(bodyParas[index], texts[index], 35, function() {
            chainParas(index + 1);
          });
        }
        chainParas(0);
      });
    },

    _typewriter: function(el, text, wps, onDone) {
      var words = text.split(' ');
      var i = 0;
      el.textContent = '';
      var base = 1000 / wps;
      (function tick() {
        if (i >= words.length) {
          if (onDone) onDone();
          return;
        }
        el.textContent += (i > 0 ? ' ' : '') + words[i++];
        setTimeout(tick, base + (Math.random() * 10 - 5));
      })();
    },

    _onEditionReady: function(edition) {
      renderMythColumn(edition.myth);
      renderWeeklyPractice(edition.practice);
      editionData = edition;
      this._onDone();
    },

    _onDone: function() {
      if (!this._isRunning) return;
      this._isRunning = false;
      this._setLive(false);
      if (this._btn) this._btn.disabled = false;
    },

    _clearEdition: function() {
      var slots = [
        { id: 'lead-story',        text: 'Writing lead story…' },
        { id: 'secondary-stories', text: 'Writing secondary stories…' },
        { id: 'myth-column',       text: 'Writing myth column…' },
        { id: ‘weekly-practice’,   text: ‘Writing this week’s practice…’ }
      ];
      slots.forEach(function(s) {
        var el = document.getElementById(s.id);
        if (el) el.innerHTML = '<p class="placeholder-text">' + s.text + '</p>';
      });
    },

    _showRibbon: function() {
      if (this._ribbon) {
        this._ribbon.classList.add('is-visible');
        this._ribbon.removeAttribute('aria-hidden');
      }
    },

    _setLive: function(on) {
      if (!this._liveIndicator) return;
      if (on) {
        this._liveIndicator.classList.add('is-visible');
      } else {
        this._liveIndicator.classList.remove('is-visible');
      }
    },

    _setAgentActive: function(agentName) {
      if (!this._ribbon) return;
      var label = this._ribbon.querySelector('[data-agent="' + agentName + '"]');
      if (label) {
        label.classList.remove('is-done');
        label.classList.add('is-active');
      }
    },

    _setAgentDone: function(agentName) {
      if (!this._ribbon) return;
      var label = this._ribbon.querySelector('[data-agent="' + agentName + '"]');
      if (label) {
        label.classList.remove('is-active');
        label.classList.add('is-done');
      }
    },

    _showBanner: function(topic) {
      var existing = document.getElementById('special-edition-banner');
      if (existing) existing.remove();

      var banner = document.createElement('div');
      banner.className = 'special-edition-banner';
      banner.id = 'special-edition-banner';

      var strong = document.createElement('strong');
      strong.textContent = topic;
      banner.appendChild(document.createTextNode('Special edition on: '));
      banner.appendChild(strong);

      var main = document.querySelector('main.publication');
      if (main) main.insertAdjacentElement('beforebegin', banner);
    }
  };
```

- [ ] **Step 2: Commit this checkpoint**

```bash
git add main.js
git commit -m "feat: add RegenerateController object to main.js IIFE"
```

---

### Task 5: Wire RegenerateController into DOMContentLoaded and verify

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Add `RegenerateController.init()` to `DOMContentLoaded`**

Find (around line 1061):
```js
  document.addEventListener('DOMContentLoaded', function() {
    triggerFadeIn();
    EditorDesk.init();
    initForgetMe();
    loadEdition();
    console.log('[Plain Sight] Initialised — update PROXY_URL in main.js to enable Editor\'s Desk');
  });
```

Replace with:
```js
  document.addEventListener('DOMContentLoaded', function() {
    triggerFadeIn();
    EditorDesk.init();
    RegenerateController.init();
    initForgetMe();
    loadEdition();
    console.log('[Plain Sight] Initialised — update PROXY_URL in main.js to enable Editor\'s Desk');
  });
```

- [ ] **Step 2: Manual verification checklist (requires `vercel dev` running at `http://localhost:3000`)**

Work through each item in order:

1. **Regenerate bar present** — Input and "REGENERATE" button appear below the masthead rule, above the lead story. Correct placeholder text. No console errors.

2. **Agent ribbon hidden on load** — The six-label ribbon is not visible (opacity 0).

3. **Click Regenerate (empty topic)** — Ribbon fades in; LIVE dot pulses coral; "Scout" lights up with underline animation; content slots show loading placeholder text ("Writing lead story…" etc.); button is disabled.

4. **Ribbon progression** — Agents progress: Scout active → done, Editor active → done, Storyteller active (stays active through all 4 stories) → done, Myth-Keeper active → done, Practitioner active → done, Sub-Editor active → done.

5. **Lead typewriter** — When the lead story arrives, headline is blank then types in at ~20 wps. After headline completes, body paragraphs type in at ~35 wps, chained one after another. Pulled quote, what-to-do box, and sources appear instantly (not typewritered).

6. **Secondary stories** — Three secondary cards render instantly, one at a time, as they arrive. No typewriter.

7. **Myth and practice** — Render after `edition_ready` fires.

8. **Pipeline completion** — Button re-enables; LIVE dot disappears; ribbon labels are all in `is-done` state.

9. **Special edition with topic** — Type a topic ("e.g. QR code parking meter scams") in the input and click Regenerate. A coral-underlined banner reads "Special edition on: QR code parking meter scams" between the ribbon and main content. The lead story is about the typed topic; secondaries are from live sources.

10. **Editor's Desk mid-pipeline** — Start a regeneration (no topic), immediately click "Ask the editor about this story →" on the existing lead story. Panel should open with the prior edition's headline in the context label (editionData was not nulled).

- [ ] **Step 3: Final commit**

```bash
git add main.js
git commit -m "feat: wire RegenerateController.init() — complete Prompt A implementation"
```
