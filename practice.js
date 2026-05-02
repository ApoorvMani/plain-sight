/**
 * Plain Sight — Practice Page Logic
 * Two simulations: phishing inbox and scam scenarios
 * TODO: Tripwire demonstration — implemented in next prompt
 */

(function() {
  'use strict';

  // State management (in-memory only)
  const state = {
    inbox: {
      emails: [],
      currentIndex: 0,
      answers: [],
      isLoading: false,
      isComplete: false
    },
    scenario: {
      scenarios: [],
      currentIndex: 0,
      answers: [],
      isLoading: false,
      isComplete: false
    }
  };

  // DOM Elements
  const inboxContent = document.getElementById('inbox-content');
  const scenarioContent = document.getElementById('scenario-content');

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  function renderLoading(container) {
    return `
      <div class="loading-state">
        <div class="typing-indicator">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
        <span>Generating scenarios...</span>
      </div>
    `;
  }

  function fadeIn(element, callback) {
    element.classList.add('fade-transition');
    requestAnimationFrame(() => {
      element.classList.add('is-visible');
      if (callback) {
        setTimeout(callback, 200);
      }
    });
  }

  function fadeOut(element, callback) {
    element.classList.remove('is-visible');
    setTimeout(callback, 200);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================
  // INBOX SIMULATION
  // ============================================

  async function startInbox() {
    state.inbox.isLoading = true;
    state.inbox.currentIndex = 0;
    state.inbox.answers = [];
    state.inbox.isComplete = false;

    inboxContent.innerHTML = renderLoading(inboxContent);

    try {
      const response = await fetch('/api/sim-phishing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error('Failed to fetch emails');
      }

      const data = await response.json();
      state.inbox.emails = data.emails || [];
      state.inbox.isLoading = false;

      renderInboxQuestion();
    } catch (error) {
      console.error('Error fetching emails:', error);
      inboxContent.innerHTML = `
        <p class="placeholder-text">Something went wrong. <a href="#" class="begin-link" data-section="inbox">Try again →</a></p>
      `;
    }
  }

  function renderInboxQuestion() {
    const email = state.inbox.emails[state.inbox.currentIndex];
    if (!email) return;

    inboxContent.innerHTML = `
      <div class="email-card fade-transition">
        <p class="email-indicator">Email ${state.inbox.currentIndex + 1} of ${state.inbox.emails.length}</p>
        <div class="email-header">
          <p class="email-from">${escapeHtml(email.from_name)}</p>
          <p class="email-from-email">${escapeHtml(email.from_address)}</p>
        </div>
        <p class="email-subject">${escapeHtml(email.subject)}</p>
        <p class="email-body">${escapeHtml(email.body)}</p>
        <div class="email-choices">
          <a href="#" class="choice-link" data-choice="legitimate">Looks legitimate</a>
          <a href="#" class="choice-link" data-choice="phishing">Looks like a scam</a>
        </div>
      </div>
    `;

    fadeIn(inboxContent.querySelector('.email-card'));
    setupInboxChoiceHandlers();
  }

  function handleInboxChoice(choice) {
    const email = state.inbox.emails[state.inbox.currentIndex];
    const isPhishing = email.is_phishing;
    const isCorrect = (choice === 'phishing') === isPhishing;

    state.inbox.answers.push({
      email: email,
      userChoice: choice,
      isCorrect: isCorrect
    });

    state.inbox.currentIndex++;

    if (state.inbox.currentIndex >= state.inbox.emails.length) {
      renderInboxResults();
    } else {
      renderInboxQuestion();
    }
  }

  function setupInboxChoiceHandlers() {
    const links = inboxContent.querySelectorAll('.choice-link');
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        handleInboxChoice(link.dataset.choice);
      });
    });
  }

  function renderInboxResults() {
    const correctCount = state.inbox.answers.filter(a => a.isCorrect).length;
    const total = state.inbox.emails.length;

    let html = '<div class="results-screen fade-transition">';
    
    state.inbox.answers.forEach((answer, idx) => {
      const correct = answer.isCorrect;
      html += `
        <div class="results-item">
          <div class="results-item-header">
            <span class="results-item-subject">${escapeHtml(answer.email.subject)}</span>
            <span class="results-item-answer ${correct ? 'correct' : 'wrong'}">
              ${correct ? 'Correct' : (answer.userChoice === 'phishing' ? 'You said scam' : 'You said legitimate')}
            </span>
          </div>
          <p class="results-item-verdict">${answer.isCorrect ? '' : (answer.email.is_phishing ? 'Was a scam' : 'Was legitimate')}</p>
          <p class="results-item-explanation">${escapeHtml(answer.email.explanation)}</p>
        </div>
      `;
    });

    html += `
      <p class="results-summary">You spotted ${correctCount} of ${total}.</p>
      <div class="results-retry">
        <a href="#" class="retry-link" data-section="inbox">Try again with new emails</a>
      </div>
    `;

    html += '</div>';

    inboxContent.innerHTML = html;
    fadeIn(inboxContent.querySelector('.results-screen'));
  }

  // ============================================
  // SCENARIO SIMULATION
  // ============================================

  async function startScenario() {
    state.scenario.isLoading = true;
    state.scenario.currentIndex = 0;
    state.scenario.answers = [];
    state.scenario.isComplete = false;

    scenarioContent.innerHTML = renderLoading(scenarioContent);

    try {
      const response = await fetch('/api/sim-scam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error('Failed to fetch scenarios');
      }

      const data = await response.json();
      state.scenario.scenarios = data.scenarios || [];
      state.scenario.isLoading = false;

      renderScenarioQuestion();
    } catch (error) {
      console.error('Error fetching scenarios:', error);
      scenarioContent.innerHTML = `
        <p class="placeholder-text">Something went wrong. <a href="#" class="begin-link" data-section="scenario">Try again →</a></p>
      `;
    }
  }

  function renderScenarioQuestion() {
    const scenario = state.scenario.scenarios[state.scenario.currentIndex];
    if (!scenario) return;

    const formatLabel = {
      'sms': '',
      'voicemail': '[voicemail transcript]',
      'popup': '[browser popup]'
    };

    const formatClass = scenario.format || '';

    scenarioContent.innerHTML = `
      <div class="scenario-card fade-transition">
        <p class="scenario-indicator">Scenario ${state.scenario.currentIndex + 1} of ${state.scenario.scenarios.length}</p>
        ${formatLabel[scenario.format] ? `<p class="scenario-format-label">${formatLabel[scenario.format]}</p>` : ''}
        <p class="scenario-content ${formatClass}">${escapeHtml(scenario.content)}</p>
        <div class="scenario-choices">
          <a href="#" class="choice-link" data-choice="legitimate">Legitimate</a>
          <a href="#" class="choice-link" data-choice="scam">Scam</a>
        </div>
      </div>
    `;

    fadeIn(scenarioContent.querySelector('.scenario-card'));
    setupScenarioChoiceHandlers();
    
    // Move focus to scenario title for accessibility
    const title = scenarioContent.querySelector('.scenario-card');
    if (title) title.setAttribute('tabindex', '-1');
    title?.focus();
  }

  function handleScenarioChoice(choice) {
    const scenario = state.scenario.scenarios[state.scenario.currentIndex];
    const isScam = scenario.is_scam;
    const isCorrect = (choice === 'scam') === isScam;

    state.scenario.answers.push({
      scenario: scenario,
      userChoice: choice,
      isCorrect: isCorrect
    });

    state.scenario.currentIndex++;

    if (state.scenario.currentIndex >= state.scenario.scenarios.length) {
      renderScenarioResults();
    } else {
      renderScenarioQuestion();
    }
  }

  function setupScenarioChoiceHandlers() {
    const links = scenarioContent.querySelectorAll('.choice-link');
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        handleScenarioChoice(link.dataset.choice);
      });
    });
  }

  function renderScenarioResults() {
    const tactics = state.scenario.answers
      .map(a => a.scenario.tactic)
      .filter((t, i, arr) => arr.indexOf(t) === i);

    let html = '<div class="results-screen fade-transition">';
    
    state.scenario.answers.forEach((answer, idx) => {
      html += `
        <div class="scenario-results-item">
          <div class="scenario-results-header">
            <span class="results-item-answer ${answer.isCorrect ? 'correct' : 'wrong'}">
              ${answer.isCorrect ? 'Correct' : (answer.userChoice === 'scam' ? 'You said scam' : 'You said legitimate')}
            </span>
          </div>
          <p class="scenario-results-content">"${escapeHtml(answer.scenario.content.substring(0, 100))}..."</p>
          <p class="scenario-results-verdict">
            ${answer.scenario.explanation}
          </p>
        </div>
      `;
    });

    html += `
      <p class="results-summary">You read ${state.scenario.scenarios.length} scenarios. The tactics used were ${tactics.join(', ')}. These are the three you'll see most often.</p>
      <div class="results-retry">
        <a href="#" class="retry-link" data-section="scenario">Try again →</a>
      </div>
    `;

    html += '</div>';

    scenarioContent.innerHTML = html;
    fadeIn(scenarioContent.querySelector('.results-screen'));
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  function setupEventListeners() {
    // Begin links
    document.querySelectorAll('.begin-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        if (section === 'inbox') {
          startInbox();
        } else if (section === 'scenario') {
          startScenario();
        }
      });
    });

    // Retry links (dynamic)
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('retry-link')) {
        e.preventDefault();
        const section = e.target.dataset.section;
        if (section === 'inbox') {
          startInbox();
        } else if (section === 'scenario') {
          startScenario();
        }
      }
    });
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  function init() {
    setupEventListeners();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();