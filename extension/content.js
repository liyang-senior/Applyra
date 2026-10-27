(() => {
  const SIDEBAR_VERSION = 14;
  if (globalThis.__applyraSidebarVersion === SIDEBAR_VERSION) return;
  globalThis.__applyraSidebarVersion = SIDEBAR_VERSION;
  globalThis.__applyraSidebar = true;

  const HOST_ID = "applyra-sidebar";
  const TOKEN_KEY = "applyraToken";
  const API = "http://localhost:3000";

  let signedIn = false;
  let pinned = false;
  let open = false;
  let arrowVisible = true;
  let token = "";
  let profiles = [];
  let providers = [];
  let defaultProvider = "chatgpt";
  let historyId = null;

  function hostElement() {
    return document.getElementById(HOST_ID);
  }

  function ensureHost() {
    const existing = hostElement();
    if (existing) {
      if (existing.dataset.version === String(SIDEBAR_VERSION)) return existing;
      existing.remove();
    }

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.dataset.version = String(SIDEBAR_VERSION);
    host.dataset.state = "closed";
    host.dataset.pinned = "false";
    host.hidden = true;
    host.setAttribute("role", "complementary");
    host.setAttribute("aria-label", "Applyra job sidebar");

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        :host([hidden]) { display: none !important; }
        * { box-sizing: border-box; font-family: "Segoe UI", system-ui, sans-serif; }
        button, input, select, textarea {
          font: inherit;
          color: #1c1915;
        }
        button {
          border: 0;
          padding: 0;
          cursor: pointer;
          pointer-events: auto;
        }
        .arrow {
          position: fixed;
          top: 50%;
          right: 0;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 12px;
          height: 26px;
          transform: translateY(-50%);
          border-radius: 5px 0 0 5px;
          background: #e8e2d6;
          border: 1px solid #e4dacb;
          border-right: 0;
          transition: right 280ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        :host([data-state="open"]) .arrow { right: 320px; }
        .arrow svg {
          width: 8px;
          height: 8px;
          display: block;
          margin: 0 auto;
          fill: none;
          stroke: currentColor;
          stroke-width: 2.4;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .arrow .when-open { display: none; }
        :host([data-state="open"]) .arrow .when-closed { display: none; }
        :host([data-state="open"]) .arrow .when-open { display: block; }
        .panel {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          z-index: 1;
          width: 320px;
          background: #e8e2d6;
          border-left: 1px solid #e4dacb;
          box-shadow: -12px 0 40px rgba(48, 36, 20, 0.08);
          transform: translateX(calc(100% + 32px));
          pointer-events: none;
          transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
          display: flex;
          flex-direction: column;
        }
        :host([data-state="open"]) .panel {
          transform: translateX(0);
          pointer-events: auto;
        }
        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 12px 12px 8px;
        }
        .brand {
          font-size: 15px;
          font-weight: 650;
          letter-spacing: -0.02em;
        }
        .pin {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: #fffdf8;
          border: 1px solid #e4dacb;
        }
        .pin[aria-pressed="true"] {
          background: #0e7a45;
          color: #f7f4ee;
          border-color: #0e7a45;
        }
        .pin svg {
          width: 18px;
          height: 18px;
          display: block;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .body {
          flex: 1;
          overflow: auto;
          padding: 4px 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 12px;
          font-weight: 600;
          color: #6d655c;
        }
        input, select, textarea {
          width: 100%;
          border-radius: 10px;
          border: 1px solid #e4dacb;
          background: #fffdf8;
          padding: 8px 10px;
          font-size: 13px;
          font-weight: 500;
          color: #1c1915;
        }
        textarea { min-height: 110px; resize: vertical; }
        [hidden] { display: none !important; }
        .actions {
          display: grid;
          gap: 8px;
          margin-top: 4px;
        }
        .primary, .secondary {
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 650;
        }
        .primary {
          background: #0e7a45;
          color: #f7f4ee;
        }
        .primary:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .secondary {
          background: #fffdf8;
          border: 1px solid #e4dacb;
        }
        .msg {
          min-height: 18px;
          font-size: 12px;
          font-weight: 600;
          color: #0c693b;
        }
        .msg.error { color: #9d3428; }
        .jd-alerts { display: grid; gap: 6px; }
        .jd-alert {
          border-radius: 10px;
          padding: 8px 10px;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.35;
        }
        .jd-alert[data-kind="remote"] {
          background: #f8e8e4;
          border: 1px solid rgba(157, 52, 40, 0.25);
          color: #9d3428;
        }
        .jd-alert[data-kind="clearance"] {
          background: #fff8e8;
          border: 1px solid rgba(180, 120, 20, 0.35);
          color: #7a4e00;
        }
        @media (prefers-reduced-motion: reduce) {
          .arrow, .panel { transition: none; }
        }
      </style>
      <button class="arrow" type="button" data-action="toggle" aria-label="Show sidebar" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path class="when-closed" d="M14 6l-6 6 6 6" />
          <path class="when-open" d="M10 6l6 6-6 6" />
        </svg>
      </button>
      <div class="panel">
        <div class="top">
          <div class="brand">Applyra</div>
          <button class="pin" type="button" data-action="pin" aria-label="Pin sidebar" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.2" />
            </svg>
          </button>
        </div>
        <div class="body">
          <label>
            Profile
            <select data-field="profile"></select>
          </label>
          <label>
            AI provider
            <select data-field="provider"></select>
          </label>
          <label data-field="model-wrap">
            AI model
            <select data-field="model"></select>
          </label>
          <label>
            Format
            <select data-field="format">
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
            </select>
          </label>
          <label>
            Company name
            <input data-field="company" type="text" autocomplete="organization" />
          </label>
          <label>
            Job title
            <input data-field="title" type="text" />
          </label>
          <label>
            Job link
            <input data-field="job-link" type="url" placeholder="https://…" />
          </label>
          <label>
            Job description
            <textarea data-field="jd"></textarea>
          </label>
          <div class="jd-alerts" data-field="jd-alerts" hidden></div>
          <div class="actions" data-mode="copy" hidden>
            <button class="primary" type="button" data-action="copy-resume">Copy resume prompt</button>
            <button class="secondary" type="button" data-action="copy-cover">Copy cover letter prompt</button>
          </div>
          <label data-field="paste-wrap" hidden>
            Paste ChatGPT reply
            <textarea data-field="paste" placeholder="Paste reply, then Generate below"></textarea>
          </label>
          <div class="actions" data-mode="generate">
            <button class="primary" type="button" data-action="applied">Applied</button>
            <button class="secondary" type="button" data-action="resume">Generate resume</button>
            <button class="secondary" type="button" data-action="cover">Generate cover letter</button>
            <button class="secondary" type="button" data-action="clear">Clear form</button>
          </div>
          <div class="msg" data-field="msg" role="status"></div>
        </div>
      </div>
    `;

    const arrowBtn = shadow.querySelector("[data-action='toggle']");
    const pinBtn = shadow.querySelector("[data-action='pin']");

    function onArrowToggle(event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      // Clicking the arrow spreads (opens) or collapses the right sidebar.
      const nextOpen = host.dataset.state !== "open";
      applyOpen(host, nextOpen);
      chrome.storage.local.set({ sidebarOpen: nextOpen });
    }

    // Use click only — pointerdown + click would toggle open then closed.
    arrowBtn.addEventListener("click", onArrowToggle);
    pinBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextPinned = host.dataset.pinned !== "true";
      applyPinned(host, nextPinned);
      chrome.storage.local.set({ sidebarPinned: nextPinned });
    });
    shadow.querySelector("[data-action='applied']").addEventListener("click", () => {
      submitApplied(host);
    });
    shadow.querySelector("[data-action='resume']").addEventListener("click", () => {
      submitGenerate(host, "resume");
    });
    shadow.querySelector("[data-action='cover']").addEventListener("click", () => {
      submitGenerate(host, "cover-letter");
    });
    shadow.querySelector("[data-action='copy-resume']").addEventListener("click", () => {
      copyPrompt(host, "resume");
    });
    shadow.querySelector("[data-action='copy-cover']").addEventListener("click", () => {
      copyPrompt(host, "cover-letter");
    });
    shadow.querySelector("[data-action='clear']").addEventListener("click", () => {
      clearForm(host);
    });
    shadow.querySelector("[data-field='provider']").addEventListener("change", () => {
      fillModels(host);
      syncProviderMode(host);
    });
    shadow.querySelector("[data-field='paste']").addEventListener("input", () => {
      syncGenerateEnabled(host);
    });

    ["company", "title", "job-link", "jd"].forEach((name) => {
      shadow.querySelector(`[data-field='${name}']`).addEventListener("input", () => {
        syncJdChecks(host);
        syncAppliedEnabled(host);
        syncGenerateEnabled(host);
      });
    });

    document.documentElement.appendChild(host);
    return host;
  }

  function canShowNav() {
    return signedIn && arrowVisible;
  }

  function syncVisibility(host) {
    const show = canShowNav();
    host.hidden = !show;
    if (!show && open) {
      open = false;
      chrome.storage.local.set({ sidebarOpen: false });
    }
  }

  function applyOpen(host, nextOpen) {
    const wantOpen = Boolean(nextOpen);
    open = wantOpen && canShowNav();
    host.dataset.state = open ? "open" : "closed";
    const toggle = host.shadowRoot.querySelector("[data-action='toggle']");
    if (toggle) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute(
        "aria-label",
        open ? "Hide sidebar" : "Show sidebar",
      );
    }
    // Keep the host visible whenever the arrow is allowed so open/close works.
    syncVisibility(host);
    if (open) {
      loadSidebarData(host);
    }
  }

  function applyPinned(host, nextPinned) {
    pinned = Boolean(nextPinned);
    host.dataset.pinned = pinned ? "true" : "false";
    const pin = host.shadowRoot.querySelector("[data-action='pin']");
    pin.setAttribute("aria-pressed", pinned ? "true" : "false");
    pin.setAttribute("aria-label", pinned ? "Unpin sidebar" : "Pin sidebar");
    syncVisibility(host);
  }

  function applySignedIn(host, nextSignedIn, nextToken) {
    signedIn = Boolean(nextSignedIn);
    token = nextToken || "";
    syncVisibility(host);
    if (!signedIn && open) {
      open = false;
      host.dataset.state = "closed";
      chrome.storage.local.set({ sidebarOpen: false });
    }
  }

  function applyArrowVisible(host, next) {
    arrowVisible = next !== false;
    if (!arrowVisible && open) {
      open = false;
      host.dataset.state = "closed";
      chrome.storage.local.set({ sidebarOpen: false });
    }
    syncVisibility(host);
  }

  function setMsg(host, text, isError) {
    const el = host.shadowRoot.querySelector("[data-field='msg']");
    el.textContent = text || "";
    el.className = isError ? "msg error" : "msg";
  }

  function readFields(host) {
    const root = host.shadowRoot;
    let provider = root.querySelector("[data-field='provider']").value;
    if (provider === "chatgpt-session") provider = "chatgpt";
    return {
      profileId: root.querySelector("[data-field='profile']").value,
      provider,
      model: root.querySelector("[data-field='model']").value || "",
      format: root.querySelector("[data-field='format']").value || "pdf",
      companyName: root.querySelector("[data-field='company']").value.trim(),
      jobTitle: root.querySelector("[data-field='title']").value.trim(),
      jobLink: root.querySelector("[data-field='job-link']").value.trim(),
      jobDescription: root.querySelector("[data-field='jd']").value.trim(),
      paste: root.querySelector("[data-field='paste']").value.trim(),
    };
  }

  function fillModels(host) {
    const providerSelect = host.shadowRoot.querySelector("[data-field='provider']");
    const modelSelect = host.shadowRoot.querySelector("[data-field='model']");
    const modelWrap = host.shadowRoot.querySelector("[data-field='model-wrap']");
    const provider = providerSelect.value === "chatgpt-session"
      ? "chatgpt"
      : providerSelect.value;
    const option = providers.find((item) => item.id === provider);
    const models = Array.isArray(option?.models) ? option.models : [];
    const previous = modelSelect.value;
    modelSelect.innerHTML = models.length
      ? models
          .map(
            (model) =>
              `<option value="${escapeAttr(model.id)}">${escapeHtml(model.name)}</option>`,
          )
          .join("")
      : `<option value="">Default</option>`;
    if (previous && models.some((model) => model.id === previous)) {
      modelSelect.value = previous;
    } else if (option?.defaultModel) {
      modelSelect.value = option.defaultModel;
    }
    if (modelWrap) modelWrap.hidden = provider === "chatgpt";
  }

  function setHidden(el, hide) {
    if (!el) return;
    if (hide) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  function syncProviderMode(host) {
    const { provider } = readFields(host);
    const manual = provider === "chatgpt" || provider === "chatgpt-session";
    const pasteWrap = host.shadowRoot.querySelector("[data-field='paste-wrap']");
    const modelWrap = host.shadowRoot.querySelector("[data-field='model-wrap']");
    const copyBlock = host.shadowRoot.querySelector("[data-mode='copy']");
    setHidden(pasteWrap, !manual);
    setHidden(modelWrap, manual);
    setHidden(copyBlock, !manual);
    syncJdChecks(host);
    syncAppliedEnabled(host);
    syncGenerateEnabled(host);
  }

  function analyzeJobDescription(jd) {
    const text = String(jd || "");
    const locationPatterns = [
      /\bhybrid\b/i,
      /\bonsite\b/i,
      /\bon[\s-]*site\b/i,
      /\bin[\s-]*office\b/i,
      /\bin[\s-]*person\b/i,
      /\bon[\s-]*prem(?:ises)?\b/i,
    ];
    const clearancePatterns = [
      /\bsecurity\s+clearance\b/i,
      /\bactive\s+clearance\b/i,
      /\bmust\s+(?:hold|have|possess)\s+(?:a\s+)?(?:secret|top\s*secret|ts\/?sci|clearance)\b/i,
      /\b(?:secret|top\s*secret|ts\/?sci)\s+clearance\b/i,
      /\bpublic\s+trust\b/i,
      /\bhigh\s+risk\s+public\s+trust\b/i,
      /\bmoderate\s+risk\s+public\s+trust\b/i,
      /\bnational\s+agency\s+check\b/i,
      /\bbackground\s+investigation\b/i,
      /\bdod\s+clearance\b/i,
      /\bdoe\s+q\s+clearance\b/i,
      /\bability\s+to\s+obtain\s+(?:a\s+)?(?:secret|top\s*secret|clearance|public\s+trust)\b/i,
      /\beligible\s+for\s+(?:a\s+)?(?:secret|top\s*secret|ts\/?sci|clearance|public\s+trust)\b/i,
    ];
    function collect(patterns) {
      const found = [];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[0]) found.push(match[0].replace(/\s+/g, " ").trim());
      }
      return found;
    }
    const locationMatches = collect(locationPatterns);
    const clearanceMatches = collect(clearancePatterns);
    const hasHybridOrOnsite = locationMatches.length > 0;
    const isRemote = !hasHybridOrOnsite;
    const requiresClearance = clearanceMatches.length > 0;
    return {
      isRemote,
      requiresClearance,
      remoteWarning: hasHybridOrOnsite
        ? `Warning: JD mentions hybrid / onsite (${locationMatches.join(", ")}). It will be flagged in History.`
        : null,
      clearanceWarning: requiresClearance
        ? `Warning: JD may require clearance or public trust (${clearanceMatches.join(", ")}). It will be flagged in History.`
        : null,
    };
  }

  function syncJdChecks(host) {
    const { jobDescription } = readFields(host);
    const box = host.shadowRoot.querySelector("[data-field='jd-alerts']");
    if (!box) return;
    if (!jobDescription) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    const check = analyzeJobDescription(jobDescription);
    const parts = [];
    if (check.remoteWarning) {
      parts.push(
        `<div class="jd-alert" data-kind="remote">${escapeHtml(check.remoteWarning)}</div>`,
      );
    }
    if (check.clearanceWarning) {
      parts.push(
        `<div class="jd-alert" data-kind="clearance">${escapeHtml(check.clearanceWarning)}</div>`,
      );
    }
    box.innerHTML = parts.join("");
    box.hidden = parts.length === 0;
  }

  function syncAppliedEnabled(host) {
    const { companyName, jobTitle, jobLink, jobDescription } = readFields(host);
    const button = host.shadowRoot.querySelector("[data-action='applied']");
    if (button) {
      button.disabled = !(companyName && jobTitle && jobLink && jobDescription);
    }
  }

  function syncGenerateEnabled(host) {
    const { provider, paste, companyName, jobTitle, jobLink, jobDescription } =
      readFields(host);
    const manual = provider === "chatgpt";
    const missingRequired =
      !companyName || !jobTitle || !jobLink || !jobDescription;
    host.shadowRoot
      .querySelectorAll("[data-action='copy-resume'], [data-action='copy-cover']")
      .forEach((button) => {
        button.disabled = missingRequired;
      });
    host.shadowRoot
      .querySelectorAll("[data-action='resume'], [data-action='cover']")
      .forEach((button) => {
        button.disabled = missingRequired || (manual && !paste);
      });
  }

  async function api(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      "X-Applyra-Client": "extension",
      ...(options.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API}${path}`, { ...options, headers });
  }

  function clearForm(host) {
    const root = host.shadowRoot;
    ["company", "title", "job-link", "jd", "paste"].forEach((name) => {
      const el = root.querySelector(`[data-field='${name}']`);
      if (el) el.value = "";
    });
    historyId = null;
    syncJdChecks(host);
    syncAppliedEnabled(host);
    syncGenerateEnabled(host);
    setMsg(host, "Form cleared.");
  }

  function formatJobStatus(job) {
    if (!job) return "Working…";
    const base = job.message || job.status || "Working…";
    if (job.status === "queued" && job.queuePosition && job.queuePosition > 1) {
      return `${base} (#${job.queuePosition} in your queue)`;
    }
    return base;
  }

  async function waitForJob(host, jobId) {
    while (true) {
      const response = await api(
        `/api/generate?jobId=${encodeURIComponent(jobId)}`,
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Could not check generation status.");
      }
      const job = data.job;
      if (!job) throw new Error("Job not found.");
      setMsg(host, formatJobStatus(job));
      if (job.status === "finished" && job.result) return job.result;
      if (job.status === "failed" || job.status === "rejected") {
        throw new Error(job.error || job.message || "Generation failed.");
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  async function loadSidebarData(host) {
    if (!token) return;
    try {
      const [profilesRes, configRes] = await Promise.all([
        api("/api/profiles"),
        api("/api/ai-config"),
      ]);
      if (profilesRes.ok) {
        const data = await profilesRes.json();
        profiles = Array.isArray(data.profiles) ? data.profiles : [];
      }
      if (configRes.ok) {
        const data = await configRes.json();
        providers = (Array.isArray(data.options) ? data.options : []).filter(
          (option) => option.id !== "chatgpt-session",
        );
        defaultProvider =
          data.defaultProvider === "chatgpt-session"
            ? "chatgpt"
            : data.defaultProvider || "chatgpt";
      }
      fillSelects(host);
    } catch {
      setMsg(host, "Start Applyra at localhost:3000.", true);
    }
  }

  function fillSelects(host) {
    const profileSelect = host.shadowRoot.querySelector("[data-field='profile']");
    const providerSelect = host.shadowRoot.querySelector("[data-field='provider']");
    const previousProfile = profileSelect.value;
    const previousProvider = providerSelect.value || defaultProvider;

    profileSelect.innerHTML = profiles.length
      ? profiles
          .map(
            (profile) =>
              `<option value="${escapeAttr(profile.id)}">${escapeHtml(profile.name)}</option>`,
          )
          .join("")
      : `<option value="">No assigned profiles</option>`;
    if (previousProfile) profileSelect.value = previousProfile;

    const options =
      providers.length > 0
        ? providers
        : [
            {
              id: "chatgpt",
              label: "No API key — copy/paste ChatGPT",
              available: true,
            },
          ];
    providerSelect.innerHTML = options
      .map(
        (option) =>
          `<option value="${escapeAttr(option.id)}" ${option.available ? "" : "disabled"}>
            ${escapeHtml(option.label)}${option.available ? "" : " (not configured)"}
          </option>`,
      )
      .join("");
    const preferred =
      previousProvider === "chatgpt-session" ? "chatgpt" : previousProvider;
    providerSelect.value = preferred;
    if (!providerSelect.value) providerSelect.value = defaultProvider;
    fillModels(host);
    syncProviderMode(host);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  async function submitApplied(host) {
    const fields = readFields(host);
    if (
      !fields.companyName ||
      !fields.jobTitle ||
      !fields.jobLink ||
      !fields.jobDescription
    ) {
      setMsg(
        host,
        "Company, job title, job link, and description are required.",
        true,
      );
      return;
    }
    const check = analyzeJobDescription(fields.jobDescription);
    if (check.remoteWarning) setMsg(host, check.remoteWarning, true);
    else if (check.clearanceWarning) setMsg(host, check.clearanceWarning, true);
    else setMsg(host, "Saving…");
    try {
      const response = await api("/api/applications", {
        method: "POST",
        body: JSON.stringify({
          companyName: fields.companyName,
          jobTitle: fields.jobTitle,
          jobDescription: fields.jobDescription,
          jobLink: fields.jobLink,
          profileId: fields.profileId || undefined,
          historyId: historyId || undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setMsg(host, data.error || "Could not save application.", true);
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (data.id) historyId = data.id;
      setMsg(
        host,
        data.clearanceWarning
          ? "Marked as applied (clearance flagged in History)."
          : "Marked as applied.",
      );
    } catch {
      setMsg(host, "Could not reach Applyra.", true);
    }
  }

  function downloadBase64File(filename, base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: mimeType || "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyPrompt(host, kind) {
    const fields = readFields(host);
    if (!fields.profileId) {
      setMsg(host, "Assign a profile first.", true);
      return;
    }
    if (!fields.companyName) {
      setMsg(host, "Enter a company name.", true);
      return;
    }
    if (!fields.jobTitle) {
      setMsg(host, "Enter a job title.", true);
      return;
    }
    if (!fields.jobLink) {
      setMsg(host, "Enter a job link.", true);
      return;
    }
    if (!fields.jobDescription) {
      setMsg(host, "Enter a job description.", true);
      return;
    }
    const check = analyzeJobDescription(fields.jobDescription);
    if (check.remoteWarning) setMsg(host, check.remoteWarning, true);
    else if (check.clearanceWarning) setMsg(host, check.clearanceWarning, true);
    else setMsg(host, "Preparing ChatGPT prompt…");
    try {
      const response = await api("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          kind,
          profileId: fields.profileId,
          jd: fields.jobDescription,
          companyName: fields.companyName,
          targetRole: fields.jobTitle,
          jobLink: fields.jobLink,
          provider: "chatgpt",
          format: fields.format,
          historyId: historyId || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMsg(host, data.error || "Could not build prompt.", true);
        return;
      }
      // Fast path: prompt returned inline (no queue).
      if (data.result?.mode === "prompt" && data.result.prompt) {
        if (data.result.historyId) historyId = data.result.historyId;
        await navigator.clipboard.writeText(data.result.prompt);
        setMsg(
          host,
          "Prompt copied. Paste into ChatGPT, then paste the reply below.",
        );
        return;
      }
      if (!data.jobId) {
        setMsg(host, "Could not build prompt.", true);
        return;
      }
      setMsg(
        host,
        formatJobStatus(data.job) || "Preparing ChatGPT prompt…",
      );
      const result = await waitForJob(host, data.jobId);
      if (result.historyId) historyId = result.historyId;
      if (result.prompt) {
        await navigator.clipboard.writeText(result.prompt);
        setMsg(host, "Prompt copied. Paste into ChatGPT, then paste the reply below.");
        return;
      }
      setMsg(host, "Could not build prompt.", true);
    } catch (error) {
      setMsg(
        host,
        error instanceof Error ? error.message : "Could not reach Applyra.",
        true,
      );
    }
  }

  async function submitGenerate(host, kind) {
    const fields = readFields(host);
    if (!fields.profileId) {
      setMsg(host, "Assign a profile first.", true);
      return;
    }
    if (!fields.companyName) {
      setMsg(host, "Enter a company name.", true);
      return;
    }
    if (!fields.jobTitle) {
      setMsg(host, "Enter a job title.", true);
      return;
    }
    if (!fields.jobLink) {
      setMsg(host, "Enter a job link.", true);
      return;
    }
    if (!fields.jobDescription) {
      setMsg(host, "Enter a job description.", true);
      return;
    }
    const check = analyzeJobDescription(fields.jobDescription);
    if (fields.provider === "chatgpt" && !fields.paste) {
      setMsg(host, "Paste the ChatGPT reply first.", true);
      return;
    }
    const manualChatgpt = fields.provider === "chatgpt";
    if (check.remoteWarning) setMsg(host, check.remoteWarning, true);
    else if (check.clearanceWarning) setMsg(host, check.clearanceWarning, true);
    else {
      setMsg(
        host,
        manualChatgpt
          ? "Building from ChatGPT reply…"
          : "Received…",
      );
    }
    try {
      const response = await api("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          kind,
          profileId: fields.profileId,
          jd: fields.jobDescription,
          companyName: fields.companyName,
          targetRole: fields.jobTitle,
          jobLink: fields.jobLink,
          provider: fields.provider,
          model:
            fields.provider === "chatgpt" ? undefined : fields.model || undefined,
          format: fields.format,
          historyId: historyId || undefined,
          pastedResponse:
            fields.provider === "chatgpt" ? fields.paste || undefined : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMsg(host, data.error || "Generation failed.", true);
        return;
      }
      if (!data.jobId) {
        setMsg(host, "Could not queue generation.", true);
        return;
      }
      setMsg(
        host,
        formatJobStatus(data.job) ||
          (manualChatgpt
            ? "Building from ChatGPT reply…"
            : "Queued…"),
      );
      const result = await waitForJob(host, data.jobId);
      if (result.historyId) historyId = result.historyId;
      if (result.mode === "prompt" && result.prompt) {
        await navigator.clipboard.writeText(result.prompt);
        setMsg(
          host,
          "Prompt copied. Paste into ChatGPT, then paste the reply below.",
        );
        return;
      }
      if (result.mode === "file" && result.base64 && result.filename) {
        downloadBase64File(result.filename, result.base64, result.mimeType);
        setMsg(host, `${result.filename} saved to History and downloaded.`);
        return;
      }
      setMsg(host, "Finished.");
    } catch (error) {
      setMsg(
        host,
        error instanceof Error ? error.message : "Could not reach Applyra.",
        true,
      );
    }
  }

  document.addEventListener(
    "pointerdown",
    (event) => {
      const host = hostElement();
      if (
        !host ||
        host.hidden ||
        host.dataset.state !== "open" ||
        host.dataset.pinned === "true"
      ) {
        return;
      }
      const path = event.composedPath();
      if (path.includes(host)) return;
      // Ignore presses that originated on the arrow/panel.
      if (
        path.some(
          (node) =>
            node instanceof Element &&
            (node.classList?.contains("arrow") ||
              node.classList?.contains("panel")),
        )
      ) {
        return;
      }
      applyOpen(host, false);
      chrome.storage.local.set({ sidebarOpen: false });
    },
    true,
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const host = ensureHost();
    if (changes[TOKEN_KEY]) {
      applySignedIn(
        host,
        Boolean(changes[TOKEN_KEY].newValue),
        changes[TOKEN_KEY].newValue || "",
      );
    }
    if (changes.sidebarOpen) {
      applyOpen(host, Boolean(changes.sidebarOpen.newValue));
    }
    if (changes.sidebarPinned) {
      applyPinned(host, Boolean(changes.sidebarPinned.newValue));
    }
    if (changes.sidebarArrowVisible) {
      applyArrowVisible(host, changes.sidebarArrowVisible.newValue !== false);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "set-sidebar") {
      const host = ensureHost();
      if (!canShowNav()) {
        sendResponse({ open: false, hidden: true });
        return;
      }
      applyOpen(host, Boolean(message.open));
      sendResponse({ open: host.dataset.state === "open" });
      return;
    }
    if (message?.type === "set-arrow") {
      const host = ensureHost();
      applyArrowVisible(host, Boolean(message.visible));
      sendResponse({
        visible: arrowVisible,
        hidden: host.hidden,
      });
      return;
    }
    if (message?.type === "sidebar-state") {
      const host = hostElement();
      sendResponse({
        open: host?.dataset.state === "open",
        hidden: Boolean(host?.hidden),
        arrowVisible,
      });
    }
  });

  chrome.storage.local.get(
    [TOKEN_KEY, "sidebarOpen", "sidebarPinned", "sidebarArrowVisible"],
    (data) => {
      const host = ensureHost();
      token = data[TOKEN_KEY] || "";
      signedIn = Boolean(token);
      pinned = Boolean(data.sidebarPinned);
      arrowVisible = data.sidebarArrowVisible !== false;
      applyPinned(host, pinned);
      applyArrowVisible(host, arrowVisible);
      applySignedIn(host, signedIn, token);
      if (data.sidebarOpen && canShowNav()) {
        requestAnimationFrame(() => applyOpen(host, true));
      } else {
        syncVisibility(host);
      }
    },
  );
})();
