/**
 * Plain Sight — Main Script
 * "Granta meets Anthropic" aesthetic
 */

(function() {
  'use strict';

  /* ============================================
     CONFIGURATION
     ============================================ */
  const PROXY_URL = "https://plain-sight.vercel.app/api/claude";
  const API_BASE = "https://plain-sight.vercel.app/api";

  /* ============================================
     SYSTEM PROMPTS
     ============================================ */
  const SYSTEM_PROMPT_DISCUSS = "You are the editor of Plain Sight, a daily cybersecurity briefing for ordinary, non-technical people. A reader is asking you a follow-up question about a specific story in today's edition. The story is: [INJECTED]. Answer in calm, plain English. Never use jargon without immediately explaining it in the same sentence. Keep responses under 120 words unless the reader explicitly asks for more depth. Speak as a knowledgeable friend, not a chatbot. Never start with 'Great question' or any pleasantry. Get to the point. If a question is outside the scope of cybersecurity for ordinary people, gently redirect: 'That's a touch outside what I cover here, but...' If a reader seems anxious, acknowledge it briefly before answering. Never tell them to consult a professional unless the situation is genuinely beyond non-technical guidance. Never produce lists of 5+ items — flowing prose is the house style.";

  const SYSTEM_PROMPT_RESEARCH = "You are the editor of Plain Sight, a daily cybersecurity briefing for ordinary, non-technical people. A reader has come to the desk to research a topic — they want to understand something specific in their own time. Your job is to explain it clearly, in plain English, like you'd explain it to a friend across a kitchen table. Use real-world analogies. Avoid lists of 5+ items. Don't lecture. If the reader's topic is broad, ask them one focused clarifying question before diving in. If they ask about a current threat, ground your answer in well-established mechanics rather than speculating about today's news. Never start with 'Great question' or pleasantries. If they ask something off-topic (general programming, world news, anything not about staying safe online), gently redirect.";

  const SYSTEM_PROMPT_PERSONALISE = "You are the editor of Plain Sight, helping a reader make tomorrow's edition more relevant to them. Your job is to learn — through warm, natural conversation — about (a) which UK region they live in, (b) roughly what age band they're in (only if they volunteer it; never push), (c) which apps and services they use most (banking, WhatsApp, email, etc.), (d) what they're most worried about online, (e) whether they're reading this for themselves or for someone they care for. Ask ONE question at a time. Make it conversational — never feel like a form. After each answer, briefly acknowledge what they've told you and ask the next question naturally. After you have enough — usually 4-6 exchanges — wrap up: thank them, summarise what tomorrow's edition will focus on, and tell them they can close the desk. Never list everything you've stored. Never feel clinical. Never ask all questions at once. The reader's responses can be vague — 'I just want to keep my mum safe' is enough; don't push for specifics they don't volunteer. After each user response, if you've extracted a structured fact (region, age_band, concerns, apps_used, caring_for), output it AT THE START of your response wrapped in a special tag like this exactly: <<PROFILE_UPDATE>>{\"region\": \"North East England\"}<<END>> — then continue the conversation naturally below. The frontend will parse and strip these tags before display. NEVER show these tags to the user in your visible response.";

  /* ============================================
     DATA STORAGE KEYS
     ============================================ */
  const STORAGE_KEY_READER = 'plainsight_reader_v1';

  /* ============================================
     TOOL USAGE TRACKING
     ============================================ */
  var recentToolUses = [];

  /* ============================================
     EDITION DATA
     ============================================ */
  var editionData = null;

  /* ============================================
     DESK CONTEXT
     ============================================ */
  var deskContext = {
    currentStory: null,
    mode: 'general',
    conversation: []
  };

  /* ============================================
     READER PROFILE MODULE
     ============================================ */
  var readerProfile = {
    get: function() {
      try {
        var stored = localStorage.getItem(STORAGE_KEY_READER);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (e) {
        console.warn('Failed to read reader profile:', e);
      }
      return this._defaultProfile();
    },

    update: function(partial) {
      try {
        var current = this.get();
        var updated = Object.assign({}, current, partial);
        if (partial.concerns && partial.concerns.length) {
          updated.concerns = (current.concerns || []).concat(partial.concerns);
        }
        if (partial.apps_used && partial.apps_used.length) {
          updated.apps_used = (current.apps_used || []).concat(partial.apps_used);
        }
        localStorage.setItem(STORAGE_KEY_READER, JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to update reader profile:', e);
      }
    },

    clear: function() {
      try {
        localStorage.removeItem(STORAGE_KEY_READER);
      } catch (e) {
        console.warn('Failed to clear reader profile:', e);
      }
    },

    _defaultProfile: function() {
      return {
        region: null,
        age_band: null,
        concerns: [],
        apps_used: [],
        caring_for: null,
        language_preference: 'en'
      };
    }
  };

  /* ============================================
     TOOL USAGE TRACKING
     ============================================ */
  function trackToolUse(toolType, result) {
    recentToolUses.push({
      tool: toolType,
      result: result,
      timestamp: Date.now()
    });

    if (recentToolUses.length > 3) {
      recentToolUses = recentToolUses.slice(-3);
    }
  }

  function getToolContextNote() {
    if (recentToolUses.length === 0) return null;

    var notes = [];
    recentToolUses.forEach(function(use) {
      if (use.tool === 'hibp') {
        notes.push('checked an email against breach records');
      } else if (use.tool === 'url-check') {
        notes.push('had a URL analysed');
      } else if (use.tool === 'scam-decoder') {
        notes.push('had a message decoded');
      }
    });

    if (notes.length > 0) {
      return 'In this session, you ' + notes.join(', ') + '.';
    }
    return null;
  }

  /* ============================================
     EMBEDDED TOOLS MODULE
     ============================================ */
  var embeddedTools = {
    HibpWidget: {
      render: function(container, promptText) {
        if (!container) return;

        var widget = document.createElement('div');
        widget.className = 'embedded-tool-widget embedded-tool-hibp';
        widget.innerHTML =
          '<p class="embedded-tool-label">CHECK NOW</p>' +
          '<p class="embedded-tool-prompt">' + escapeHtml(promptText) + '</p>' +
          '<div class="embedded-tool-form">' +
            '<input type="email" class="embedded-tool-input" placeholder="your@email.com" />' +
            '<a href="#" class="embedded-tool-submit">Check →</a>' +
          '</div>' +
          '<div class="embedded-tool-result" style="display:none;"></div>';

        container.appendChild(widget);

        var input = widget.querySelector('.embedded-tool-input');
        var submit = widget.querySelector('.embedded-tool-submit');
        var result = widget.querySelector('.embedded-tool-result');

        submit.addEventListener('click', function(e) {
          e.preventDefault();
          var email = input.value.trim();
          if (!email || !email.includes('@')) {
            result.innerHTML = '<p class="tool-error">Please enter a valid email.</p>';
            result.style.display = 'block';
            return;
          }

          result.innerHTML = '<span class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>';
          result.style.display = 'block';

          fetch(API_BASE + '/hibp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
          })
          .then(function(response) { return response.json(); })
          .then(function(data) {
            if (data.error) {
              result.innerHTML = '<p class="tool-error">' + escapeHtml(data.error) + '</p>';
              return;
            }

            var isDemo = data.demo;
            var breaches = data.breaches || [];
            var count = breaches.length;
            var html = '';

            if (isDemo) {
              html += '<span class="tool-demo-badge">[demo data]</span>';
            }

            if (data.breached && count > 0) {
              html += '<p>Your email appears in ' + count + ' known breach' + (count > 1 ? 'es' : '') + '.</p>';
              if (breaches[0]) {
                html += '<p>Here\'s what was exposed: ' + escapeHtml(breaches[0].exposed_data.join(', ')) + '</p>';
              }
              html += '<p class="tool-note">That\'s a good baseline to start from. Keep an eye on the basics — different passwords for different accounts, and a password manager helps.</p>';
            } else {
              html += '<p>No known breaches. That\'s a good baseline, not a guarantee.</p>';
            }

            result.innerHTML = html;

            trackToolUse('hibp', count);
          })
          .catch(function(e) {
            console.error('HIBP error:', e);
            result.innerHTML = '<p class="tool-error">Something went wrong. Try again?</p>';
          });
        });
      }
    },

    UrlCheckWidget: {
      render: function(container, promptText) {
        if (!container) return;

        var widget = document.createElement('div');
        widget.className = 'embedded-tool-widget embedded-tool-url';
        widget.innerHTML =
          '<p class="embedded-tool-label">ANALYSE THIS</p>' +
          '<p class="embedded-tool-prompt">' + escapeHtml(promptText) + '</p>' +
          '<div class="embedded-tool-form">' +
            '<input type="url" class="embedded-tool-input" placeholder="https://example.com" />' +
            '<a href="#" class="embedded-tool-submit">Analyse →</a>' +
          '</div>' +
          '<div class="embedded-tool-result" style="display:none;"></div>';

        container.appendChild(widget);

        var input = widget.querySelector('.embedded-tool-input');
        var submit = widget.querySelector('.embedded-tool-submit');
        var result = widget.querySelector('.embedded-tool-result');

        submit.addEventListener('click', function(e) {
          e.preventDefault();
          var urlValue = input.value.trim();
          if (!urlValue) {
            result.innerHTML = '<p class="tool-error">Please enter a URL.</p>';
            result.style.display = 'block';
            return;
          }

          result.innerHTML = '<span class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>';
          result.style.display = 'block';

          fetch(API_BASE + '/url-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: urlValue })
          })
          .then(function(response) { return response.json(); })
          .then(function(data) {
            if (data.error) {
              result.innerHTML = '<p class="tool-error">' + escapeHtml(data.error) + '</p>';
              return;
            }

            var html = '';
            var verdicts = {
              'likely_safe': 'This one looks OK.',
              'suspicious': 'This one has some red flags.',
              'likely_phishing': 'This looks like a scam.'
            };

            html += '<p class="tool-verdict">' + (verdicts[data.verdict] || data.verdict) + '</p>';
            html += '<p class="tool-reasons">' + escapeHtml(data.reasons.join('. ')) + '.</p>';
            html += '<p class="tool-explanation">' + escapeHtml(data.plain_explanation) + '</p>';
            html += '<p class="tool-note">Analysed using known phishing patterns. Always cross-check with the official Action Fraud reporting site for confirmed scams.</p>';

            result.innerHTML = html;

            trackToolUse('url-check', data.verdict);
          })
          .catch(function(e) {
            console.error('URL check error:', e);
            result.innerHTML = '<p class="tool-error">Something went wrong. Try again?</p>';
          });
        });
      }
    },

    ScamDecoderWidget: {
      render: function(container, promptText) {
        if (!container) return;

        var widget = document.createElement('div');
        widget.className = 'embedded-tool-widget embedded-tool-scam';
        widget.innerHTML =
          '<p class="embedded-tool-label">DECODE THIS</p>' +
          '<p class="embedded-tool-prompt">' + escapeHtml(promptText) + '</p>' +
          '<div class="embedded-tool-form">' +
            '<textarea class="embedded-tool-textarea" rows="4" placeholder="Paste the suspicious message here..."></textarea>' +
            '<a href="#" class="embedded-tool-submit">Decode →</a>' +
          '</div>' +
          '<div class="embedded-tool-result" style="display:none;"></div>';

        container.appendChild(widget);

        var textarea = widget.querySelector('.embedded-tool-textarea');
        var submit = widget.querySelector('.embedded-tool-submit');
        var result = widget.querySelector('.embedded-tool-result');

        submit.addEventListener('click', function(e) {
          e.preventDefault();
          var message = textarea.value.trim();
          if (!message || message.length < 10) {
            result.innerHTML = '<p class="tool-error">Please paste a longer message.</p>';
            result.style.display = 'block';
            return;
          }

          result.innerHTML = '<span class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>';
          result.style.display = 'block';

          fetch(API_BASE + '/scam-decoder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message })
          })
          .then(function(response) { return response.json(); })
          .then(function(data) {
            if (data.error) {
              result.innerHTML = '<p class="tool-error">' + escapeHtml(data.error) + '</p>';
              return;
            }

            var html = '';
            var verdicts = {
              'likely_scam': 'Likely scam',
              'probably_legit': 'Probably legitimate',
              'unclear': 'Can\'t tell'
            };
            var tactics = {
              'urgency': 'Pressure to act fast',
              'authority': 'Pretending to be an official organisation',
              'fear': 'Trying to frighten you',
              'greed': 'Promise of money or reward',
              'curiosity': 'Tempting you to click something',
              'none': 'No clear tactic detected'
            };

            html += '<p class="tool-verdict">' + (verdicts[data.verdict] || data.verdict) + '</p>';
            if (data.tactic && data.tactic !== 'none') {
              html += '<p class="tool-tactic">Tactic: ' + (tactics[data.tactic] || data.tactic) + '</p>';
            }
            html += '<p class="tool-explanation">' + escapeHtml(data.plain_explanation) + '</p>';
            if (data.what_to_do) {
              html += '<p class="tool-action">' + escapeHtml(data.what_to_do) + '</p>';
            }

            result.innerHTML = html;

            trackToolUse('scam-decoder', data.verdict);
          })
          .catch(function(e) {
            console.error('Scam decoder error:', e);
            result.innerHTML = '<p class="tool-error">Something went wrong. Try again?</p>';
          });
        });
      }
    }
  };

  /* ============================================
     EDITOR'S DESK MODULE
     ============================================ */
  var EditorDesk = {
    panels: {
      trigger: null,
      panel: null,
      backdrop: null,
      close: null,
      input: null,
      inputForm: null,
      contextLabel: null,
      conversation: null,
      quickStarts: null
    },

    isOpen: false,
    isStreaming: false,

    init: function() {
      this.panels.trigger = document.getElementById('editor-desk-trigger');
      this.panels.panel = document.getElementById('editor-desk-panel');
      this.panels.backdrop = document.getElementById('editor-backdrop');
      this.panels.close = document.getElementById('editor-panel-close');
      this.panels.input = document.getElementById('editor-input');
      this.panels.inputForm = document.getElementById('editor-input-form');
      this.panels.contextLabel = document.getElementById('editor-panel-context');
      this.panels.conversation = document.getElementById('editor-conversation');
      this.panels.quickStarts = document.querySelector('.editor-quick-starts');

      this._bindEvents();
    },

    _bindEvents: function() {
      var self = this;

      if (this.panels.trigger) {
        this.panels.trigger.addEventListener('click', function(e) {
          e.preventDefault();
          self.open('research');
        });
      }

      document.querySelectorAll('.editor-link').forEach(function(link) {
        link.addEventListener('click', function(e) {
          e.preventDefault();
          var context = link.getAttribute('data-action') || 'discuss-lead';
          var storyIdx = context.indexOf('secondary-') === 0 ? parseInt(context.split('-')[1], 10) : -1;
          var story = storyIdx >= 0 ? editionData.secondary_stories[storyIdx] : (editionData.lead_story || null);
          self.setDeskContext(story, context);
        });
      });

      if (this.panels.close) {
        this.panels.close.addEventListener('click', function(e) {
          e.preventDefault();
          self.close();
        });
      }

      if (this.panels.backdrop) {
        this.panels.backdrop.addEventListener('click', function(e) {
          self.close();
        });
      }

      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && self.isOpen) {
          self.close();
        }
      });

      if (this.panels.input) {
        this.panels.input.addEventListener('input', function(e) {
          self._autoGrowInput();
        });

        this.panels.inputForm.addEventListener('submit', function(e) {
          e.preventDefault();
          self._handleSubmit();
        });
      }

      document.querySelectorAll('.quick-start-chip').forEach(function(chip) {
        chip.addEventListener('click', function(e) {
          var prompt = chip.getAttribute('data-prompt');
          self._handleQuickStart(prompt);
        });
      });
    },

    _autoGrowInput: function() {
      var input = this.panels.input;
      if (!input) return;
      input.style.height = 'auto';
      var scrollHeight = input.scrollHeight;
      input.style.height = Math.min(scrollHeight, 120) + 'px';
    },

    setDeskContext: function(story, contextType) {
      deskContext.currentStory = story;
      deskContext.mode = 'discuss';
      deskContext.conversation = [];

      this._clearConversation();

      var toolNote = getToolContextNote();
      if (toolNote) {
        this._addSystemNote(toolNote);
      }

      this._addSystemNote('You\'re discussing: ' + (story ? story.headline : 'this story'));

      this.open(contextType);
    },

    open: function(mode) {
      if (!this.panels.panel) return;

      var self = this;
      this.isOpen = true;

      if (mode === 'discuss-lead' || mode === 'discuss') {
        deskContext.mode = 'discuss';
      } else if (mode === 'research') {
        deskContext.mode = 'research';
      } else if (mode === 'personalise') {
        deskContext.mode = 'personalise';
      }

      if (this.panels.contextLabel) {
        if (deskContext.currentStory && deskContext.mode === 'discuss') {
          this.panels.contextLabel.textContent = 'Discussing: ' + deskContext.currentStory.headline;
          this.panels.contextLabel.style.display = 'block';
        } else if (deskContext.mode === 'personalise') {
          this.panels.contextLabel.textContent = 'Personalising your edition';
          this.panels.contextLabel.style.display = 'block';
        } else {
          this.panels.contextLabel.style.display = 'none';
        }
      }

      if (this.panels.input) {
        if (deskContext.mode === 'research') {
          this.panels.input.placeholder = 'What would you like to understand?';
        } else if (deskContext.mode === 'personalise') {
          this.panels.input.placeholder = 'Tell the editor about yourself...';
        } else {
          this.panels.input.placeholder = 'What would you like to ask?';
        }
      }

      if (deskContext.conversation.length === 0) {
        this._showEmptyState();
      }

      this.panels.panel.classList.add('is-open');
      if (this.panels.backdrop) {
        this.panels.backdrop.classList.add('is-visible');
      }

      setTimeout(function() {
        if (self.panels.input) self.panels.input.focus();
      }, 300);
    },

    close: function() {
      if (!this.panels.panel) return;

      this.isOpen = false;
      this.panels.panel.classList.remove('is-open');
      if (this.panels.backdrop) {
        this.panels.backdrop.classList.remove('is-visible');
      }
    },

    _showEmptyState: function() {
      if (!this.panels.conversation) return;
      this.panels.conversation.innerHTML = '<p class="editor-empty-state">The editor is at her desk.</p>';
    },

    _clearConversation: function() {
      if (!this.panels.conversation) return;
      this.panels.conversation.innerHTML = '';
    },

    _addSystemNote: function(text) {
      if (!this.panels.conversation) return;
      var note = document.createElement('p');
      note.className = 'editor-system-note';
      note.textContent = text;
      this.panels.conversation.appendChild(note);
    },

    _addUserMessage: function(text) {
      if (!this.panels.conversation) return;

      var emptyState = this.panels.conversation.querySelector('.editor-empty-state');
      if (emptyState) emptyState.remove();

      var msg = document.createElement('div');
      msg.className = 'editor-message editor-message-user';
      msg.textContent = text;
      this.panels.conversation.appendChild(msg);

      this._addSeparator();

      this.panels.conversation.scrollTop = this.panels.conversation.scrollHeight;
    },

    _addAssistantBubble: function() {
      if (!this.panels.conversation) return;

      var bubble = document.createElement('div');
      bubble.className = 'editor-message editor-message-assistant';
      bubble.innerHTML = '<span class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>';
      this.panels.conversation.appendChild(bubble);

      this.panels.conversation.scrollTop = this.panels.conversation.scrollHeight;
      return bubble;
    },

    _updateAssistantBubble: function(bubble, text) {
      if (!bubble) return;
      bubble.innerHTML = text;
      if (this.panels.conversation) {
        this.panels.conversation.scrollTop = this.panels.conversation.scrollHeight;
      }
    },

    _addSeparator: function() {
      if (!this.panels.conversation) return;
      var sep = document.createElement('hr');
      sep.className = 'editor-separator';
      this.panels.conversation.appendChild(sep);
    },

    _showError: function(message) {
      if (!this.panels.conversation) return;

      var typing = this.panels.conversation.querySelector('.typing-indicator');
      if (typing) typing.parentElement.remove();

      var err = document.createElement('div');
      err.className = 'editor-message editor-message-error';
      err.textContent = message;
      this.panels.conversation.appendChild(err);

      this.panels.conversation.scrollTop = this.panels.conversation.scrollHeight;
    },

    _handleQuickStart: function(type) {
      if (deskContext.conversation.length > 0 && !confirm('Start a new conversation? This will clear what we\'ve discussed.')) {
        return;
      }

      deskContext.conversation = [];
      this._clearConversation();

      if (type === 'Discuss today\'s lead') {
        var story = editionData.lead_story || null;
        this.setDeskContext(story, 'discuss-lead');
        this._sendMessage('Tell me more about today\'s lead story.');
      } else if (type === 'Research a topic') {
        deskContext.mode = 'research';
        deskContext.currentStory = null;
        this.open('research');
      } else if (type === 'Personalise my edition') {
        deskContext.mode = 'personalise';
        deskContext.currentStory = null;
        this.open('personalise');
        this._sendMessage('Happy to help tailor tomorrow\'s edition. To start — which part of the UK are you in?');
      }
    },

    _handleSubmit: function() {
      var input = this.panels.input;
      if (!input || !input.value.trim() || this.isStreaming) return;

      var message = input.value.trim();
      input.value = '';
      input.style.height = 'auto';

      this._sendMessage(message);
    },

    _sendMessage: function(message) {
      var self = this;

      this._addUserMessage(message);

      deskContext.conversation.push({ role: 'user', content: message });

      this.isStreaming = true;
      if (this.panels.input) {
        this.panels.input.disabled = true;
      }

      var bubble = this._addAssistantBubble();

      var systemPrompt = this._getSystemPrompt();
      var messages = deskContext.conversation.map(function(m) {
        return { role: m.role, content: m.content };
      });

      fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: systemPrompt,
          messages: messages,
          max_tokens: 1024
        })
      })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Editor unavailable');
        }
        return response.text();
      })
      .then(function(text) {
        var assistantText = '';
        var lines = text.split('\n');
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (line.startsWith('data: ')) {
            var data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              var parsed = JSON.parse(data);
              if (parsed.text) {
                assistantText += parsed.text;
              }
            } catch (e) {}
          }
        }

        if (deskContext.mode === 'personalise') {
          var extracted = self._extractProfileUpdates(assistantText);
          if (extracted.length > 0) {
            extracted.forEach(function(update) {
              readerProfile.update(update);
            });
          }
          assistantText = assistantText.replace(/<<PROFILE_UPDATE>>.*?<<END>>/g, '').trim();
          if (assistantText === '') {
            assistantText = '...';
          }
        }

        self._updateAssistantBubble(bubble, assistantText);
        deskContext.conversation.push({ role: 'assistant', content: assistantText });
      })
      .catch(function(e) {
        console.error('Editor error:', e);
        self._showError('The editor stepped away for a moment. Try again?');
      })
      .finally(function() {
        self.isStreaming = false;
        if (self.panels.input) {
          self.panels.input.disabled = false;
          self.panels.input.focus();
        }
      });
    },

    _getSystemPrompt: function() {
      if (deskContext.mode === 'discuss' && deskContext.currentStory) {
        var story = deskContext.currentStory;
        var storyText = 'Headline: ' + story.headline + '\n';
        if (story.body && story.body.length) {
          storyText += 'Body: ' + story.body.join('\n\n') + '\n';
        }
        if (story.what_to_do) {
          storyText += 'What to do: ' + story.what_to_do + '\n';
        }
        return SYSTEM_PROMPT_DISCUSS.replace('[INJECTED]', storyText);
      } else if (deskContext.mode === 'personalise') {
        return SYSTEM_PROMPT_PERSONALISE;
      } else {
        return SYSTEM_PROMPT_RESEARCH;
      }
    },

    _extractProfileUpdates: function(text) {
      var updates = [];
      var regex = /<<PROFILE_UPDATE>>\s*(\{.*?\})\s*<<END>>/g;
      var match;
      while ((match = regex.exec(text)) !== null) {
        try {
          updates.push(JSON.parse(match[1]));
        } catch (e) {}
      }
      return updates;
    }
  };

  function setDeskContext(storyHeadline, storyType) {
    var story = null;
    if (storyType === 'discuss-lead') {
      story = editionData.lead_story;
    } else if (storyType && storyType.indexOf('secondary-') === 0) {
      var idx = parseInt(storyType.split('-')[1], 10);
      story = editionData.secondary_stories[idx];
    }
    EditorDesk.setDeskContext(story, storyType);
  }

  /* ============================================
     DATE FORMATTING
     ============================================ */
  function formatEditionDate(dateString) {
    if (!dateString) return null;
    try {
      var date = new Date(dateString + 'T12:00:00Z');
      var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      return date.toLocaleDateString('en-GB', options);
    } catch (e) {
      return null;
    }
  }

  function insertEditionDate(dateString) {
    var dateEl = document.getElementById('current-date');
    if (!dateEl) return;

    var formatted = formatEditionDate(dateString);
    if (formatted) {
      dateEl.textContent = formatted;
      dateEl.setAttribute('datetime', dateString);
    }
  }

  /* ============================================
     EDITION RENDERER
     ============================================ */
  function renderEdition(data) {
    if (!data) return;

    editionData = data;
    insertEditionDate(data.edition_date);

    renderLeadStory(data.lead_story);
    renderSecondaryStories(data.secondary_stories);
    renderMythColumn(data.myth);
    renderWeeklyPractice(data.practice);
  }

  function renderLeadStory(story) {
    var container = document.getElementById('lead-story');
    if (!container || !story) return;

    var html = '';

    if (story.kicker) {
      html += '<p class="kicker">' + escapeHtml(story.kicker) + '</p>';
    }

    if (story.headline) {
      html += '<h2 class="story-headline">' + escapeHtml(story.headline) + '</h2>';
    }

    if (story.pulled_quote) {
      html += '<blockquote class="pulled-quote">' + escapeHtml(story.pulled_quote) + '</blockquote>';
    }

    if (story.body && story.body.length) {
      story.body.forEach(function(para) {
        html += '<p>' + escapeHtml(para) + '</p>';
      });
    }

    if (story.what_to_do) {
      html += '<div class="what-to-do">';
      html += '<p class="what-to-do-label">WHAT TO DO</p>';
      html += '<p class="what-to-do-text">' + escapeHtml(story.what_to_do) + '</p>';
      html += '</div>';
    }

    if (story.sources && story.sources.length) {
      html += '<ul class="story-sources">';
      story.sources.forEach(function(source) {
        html += '<li><a href="' + escapeHtml(source.url) + '" target="_blank" rel="noopener">' + escapeHtml(source.title) + '</a></li>';
      });
      html += '</ul>';
    }

    html += '<p class="story-meta"><a href="#" class="editor-link" data-action="discuss-lead">Ask the editor about this story →</a></p>';

    container.innerHTML = html;

    container.querySelector('.editor-link').addEventListener('click', function(e) {
      e.preventDefault();
      setDeskContext(story.headline, 'discuss-lead');
    });
  }

  function renderSecondaryStories(stories) {
    var container = document.getElementById('secondary-stories');
    if (!container || !stories || !stories.length) return;

    var html = '';

    stories.forEach(function(story, index) {
      html += '<article class="secondary-story">';

      html += '<div class="secondary-story-header">';
      if (story.headline) {
        html += '<h3 class="secondary-story-title">' + escapeHtml(story.headline) + '</h3>';
      }
      if (story.severity) {
        html += '<span class="severity-badge severity-' + story.severity.toLowerCase() + '">' + story.severity + '</span>';
      }
      html += '</div>';

      if (story.body) {
        html += '<p>' + escapeHtml(story.body) + '</p>';
      }

      if (story.what_to_do) {
        html += '<div class="what-to-do">';
        html += '<p class="what-to-do-label">WHAT TO DO</p>';
        html += '<p class="what-to-do-text">' + escapeHtml(story.what_to_do) + '</p>';
        html += '</div>';
      }

      if (story.embedded_tool) {
        html += '<div class="embedded-tool-container" data-tool-type="' + story.embedded_tool.type + '" data-placement="' + story.embedded_tool.placement + '" data-prompt="' + escapeHtml(story.embedded_tool.prompt_text) + '"></div>';
      }

      html += '<p class="story-meta"><a href="#" class="editor-link" data-action="secondary-' + index + '">Ask the editor about this story →</a></p>';

      html += '</article>';
    });

    container.innerHTML = html;

    container.querySelectorAll('.editor-link').forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        var action = link.getAttribute('data-action');
        setDeskContext(null, action);
      });
    });

    container.querySelectorAll('.embedded-tool-container').forEach(function(el) {
      var toolType = el.getAttribute('data-tool-type');
      var promptText = el.getAttribute('data-prompt');
      if (toolType === 'hibp') {
        embeddedTools.HibpWidget.render(el, promptText);
      } else if (toolType === 'url_check') {
        embeddedTools.UrlCheckWidget.render(el, promptText);
      } else if (toolType === 'scam_decoder') {
        embeddedTools.ScamDecoderWidget.render(el, promptText);
      }
    });
  }

  function renderMythColumn(myth) {
    var container = document.getElementById('myth-column');
    if (!container || !myth) return;

    var html = '';

    if (myth.myth_statement) {
      html += '<h3 class="myth-statement">' + escapeHtml(myth.myth_statement) + '</h3>';
    }

    if (myth.verdict) {
      html += '<p class="myth-verdict">VERDICT: ' + escapeHtml(myth.verdict) + '</p>';
    }

    if (myth.explanation && myth.explanation.length) {
      myth.explanation.forEach(function(para) {
        html += '<p>' + escapeHtml(para) + '</p>';
      });
    }

    if (myth.what_to_do) {
      html += '<div class="what-to-do">';
      html += '<p class="what-to-do-label">WHAT TO DO</p>';
      html += '<p class="what-to-do-text">' + escapeHtml(myth.what_to_do) + '</p>';
      html += '</div>';
    }

    if (myth.embedded_tool) {
      html += '<div class="embedded-tool-container" data-tool-type="' + myth.embedded_tool.type + '" data-placement="' + myth.embedded_tool.placement + '" data-prompt="' + escapeHtml(myth.embedded_tool.prompt_text) + '"></div>';
    }

    container.innerHTML = html;

    container.querySelectorAll('.embedded-tool-container').forEach(function(el) {
      var toolType = el.getAttribute('data-tool-type');
      var promptText = el.getAttribute('data-prompt');
      if (toolType === 'hibp') {
        embeddedTools.HibpWidget.render(el, promptText);
      } else if (toolType === 'url_check') {
        embeddedTools.UrlCheckWidget.render(el, promptText);
      } else if (toolType === 'scam_decoder') {
        embeddedTools.ScamDecoderWidget.render(el, promptText);
      }
    });
  }

  function renderWeeklyPractice(practice) {
    var container = document.getElementById('weekly-practice');
    if (!container || !practice) return;

    var html = '';

    if (practice.subtitle) {
      html += '<p class="practice-subtitle">' + escapeHtml(practice.subtitle) + '</p>';
    }

    if (practice.title) {
      html += '<h3>' + escapeHtml(practice.title) + '</h3>';
    }

    if (practice.body && practice.body.length) {
      practice.body.forEach(function(para) {
        html += '<p>' + escapeHtml(para) + '</p>';
      });
    }

    container.innerHTML = html;
  }

  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showEditionPendingMessage() {
    var dateEl = document.getElementById('current-date');
    if (dateEl) {
      dateEl.textContent = "Today's edition is being prepared.";
      dateEl.classList.add('edition-pending');
    }
  }

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
        { id: 'weekly-practice',   text: 'Writing this week’s practice…' }
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

  /* ============================================
     FETCH AND RENDER EDITION
     ============================================ */
  function loadEdition() {
    fetch('data/today.json')
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Failed to fetch edition');
        }
        return response.json();
      })
      .then(function(data) {
        renderEdition(data);
      })
      .catch(function(e) {
        console.warn('Failed to load edition:', e);
        showEditionPendingMessage();
      });
  }

  /* ============================================
     FADE-IN ANIMATION
     ============================================ */
  function triggerFadeIn() {
    var fadeElements = document.querySelectorAll('.fade-in');
    fadeElements.forEach(function(el, index) {
      setTimeout(function() {
        el.classList.add('is-visible');
      }, index * 150);
    });
  }

  /* ============================================
     "FORGET ME" ETHICS FEATURE
     ============================================ */
  function initForgetMe() {
    var forgetLink = document.getElementById('forget-me-link');
    if (!forgetLink) return;

    forgetLink.addEventListener('click', function(e) {
      e.preventDefault();
      var confirmed = confirm('This will clear everything we\'ve discussed and any preferences you\'ve shared. Continue?');
      if (confirmed) {
        readerProfile.clear();
        deskContext.conversation = [];
        alert('Your data has been cleared. Reload for a fresh edition.');
      }
    });
  }

  /* ============================================
     INITIALISE ON DOM READY
     ============================================ */
  document.addEventListener('DOMContentLoaded', function() {
    triggerFadeIn();
    EditorDesk.init();
    RegenerateController.init();
    initForgetMe();
    loadEdition();
    console.log('[Plain Sight] Initialised — update PROXY_URL in main.js to enable Editor\'s Desk');
  });

  /* ============================================
     EXPOSE PUBLIC API
     ============================================ */
  window.PlainSight = {
    readerProfile: readerProfile,
    EditorDesk: EditorDesk,
    setDeskContext: setDeskContext
  };

})();