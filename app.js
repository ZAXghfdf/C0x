/* ============================================================
   CASE 3301 — SAVER TEAM
   Vanilla JS. No dependencies.

   IMPORTANT — ضبط المفتاح الصحيح:
   - المفتاح الحالي مستخرج من QR نهاية الريل: KEY=0x53544152545F4F53494E54
   - الموقع مقفول على هذا المفتاح فقط (acceptHexPattern = false).
   - لتجربة الموقع بمفتاح آخر: عدّل acceptedKeys.
   - لتجاوز التحقق مؤقتاً: اجعل acceptHexPattern = true، وسيقبل
     أي مفتاح Hex بطول 8 إلى 64 خانة.
   ============================================================ */

(() => {
  "use strict";

  const CONFIG = {
    // المفتاح المستخرج من ملف 3301 (START_OSINT بالـ Hex)
    acceptedKeys: ["KEY=0x0"],

    // false = لا يُقبل إلا المفتاح أعلاه. true = وضع مرن للتجربة فقط.
    acceptHexPattern: true,
    hexPattern: /^[0-9A-F]{8,64}$/,

    proofText:
      "3301 // ACCESS_GRANTED\n" +
      "أثبتُّ أنني لست مشاهداً عادياً — وصلت إلى نهاية اللغز.\n" +
      "من صائدي الشيفرة — فريق سايڤر.",

    sessionKey: "saver3301.access"
  };

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const dom = {
    loader: $("#loader"),
    loaderStatus: $("#loaderStatus"),
    loaderCount: $("#loaderCount"),
    loaderBar: $("#loaderBar"),
    loaderTrack: $(".loader__track"),
    loaderLog: $("#loaderLog"),
    skipIntro: $("#skipIntro"),
    transition: $("#transition"),
    transitionText: $("#transitionText"),

    app: $("#app"),
    topbar: $("#topbar"),
    utcClock: $("#utcClock"),
    sessionStatus: $("#sessionStatus"),
    soundToggle: $("#soundToggle"),

    challengeView: $("#challengeView"),
    unlockedView: $("#unlockedView"),
    accessPanel: $("#accessPanel"),
    keyForm: $("#keyForm"),
    keySuffix: $("#keySuffix"),
    keyField: $("#keyField"),
    submitBtn: $("#submitBtn"),
    submitLabel: $("#submitLabel"),
    formError: $("#formError"),
    terminalStatus: $("#terminalStatus"),
    hintTrigger: $("#hintTrigger"),
    consoleLine: $("#consoleLine"),
    emblemStage: $("#emblemStage"),

    hintModal: $("#hintModal"),
    toast: $("#toast"),

    proofText: $("#proofText"),
    copyProof: $("#copyProof"),
    copyLabel: $("#copyLabel"),
    lockSession: $("#lockSession"),

    year: $("#year")
  };

  const state = {
    view: "challenge",
    attempts: 0,
    transitioning: false,
    verifying: false,
    memoryAccess: false,
    loaderFinished: false,
    lastFocused: null,
    toastTimer: null
  };

  // نخزّن الجزء الذي يأتي بعد KEY=0x فقط
  const acceptedSuffixes = new Set(
    CONFIG.acceptedKeys.map((key) => normalizeKey(key)).filter(Boolean)
  );

  /* ============================================================
     STORAGE / ROUTING
     ============================================================ */

  function readAccess() {
    try {
      return window.sessionStorage.getItem(CONFIG.sessionKey) === "granted";
    } catch (_) {
      return state.memoryAccess;
    }
  }

  function saveAccess(value) {
    state.memoryAccess = value;
    try {
      if (value) {
        window.sessionStorage.setItem(CONFIG.sessionKey, "granted");
      } else {
        window.sessionStorage.removeItem(CONFIG.sessionKey);
      }
    } catch (_) {
      /* Private mode / file protocol — memory fallback is enough. */
    }
  }

  function updateUrl(view) {
    try {
      const base = window.location.pathname + window.location.search;
      const next = view === "unlocked" ? `${base}#unlocked` : base;
      window.history.replaceState(null, "", next);
    } catch (_) {
      /* file:// or restricted environment */
    }
  }

  /* ============================================================
     TEXT / KEY HELPERS
     ============================================================ */

  function normalizeKey(value) {
    if (!value) return "";

    let normalized = String(value)
      .normalize("NFKC")
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/\s+/g, "")
      .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
      .toUpperCase();

    // يسمح بلصق الناتج الكامل للـ QR: "3301 // 53 54 ..."
    normalized = normalized.replace(/^3301\/+/, "");

    if (normalized.startsWith("KEY=0X")) {
      normalized = normalized.slice(6);
    } else if (normalized.startsWith("0X")) {
      normalized = normalized.slice(2);
    } else if (normalized.startsWith("KEY=")) {
      normalized = normalized.slice(4).replace(/^0X/, "");
    }

    return normalized;
  }

  function fullKeyFromSuffix(suffix) {
    return `KEY=0x${suffix}`;
  }

  function validateSuffix(suffix) {
    if (!suffix) return { ok: false, reason: "empty" };

    if (!/^[0-9A-F]+$/.test(suffix)) {
      return { ok: false, reason: "characters" };
    }

    const fullKey = fullKeyFromSuffix(suffix);

    if (acceptedSuffixes.has(suffix)) {
      return { ok: true, fullKey, strict: true };
    }

    if (CONFIG.acceptHexPattern && CONFIG.hexPattern.test(suffix)) {
      return { ok: true, fullKey, strict: false };
    }

    if (suffix.length < 8) {
      return { ok: false, reason: "short" };
    }

    return { ok: false, reason: "wrong" };
  }

  function setTerminalStatus(text, mode) {
    if (!dom.terminalStatus) return;
    dom.terminalStatus.textContent = text;
    dom.terminalStatus.classList.remove("is-verifying", "is-denied", "is-granted");
    if (mode) dom.terminalStatus.classList.add(`is-${mode}`);
  }

  function setConsole(text, mode) {
    if (!dom.consoleLine) return;
    dom.consoleLine.textContent = `> ${text}`;
    dom.consoleLine.parentElement.classList.remove("is-denied", "is-granted");
    if (mode) dom.consoleLine.parentElement.classList.add(`is-${mode}`);
  }

  function clearError() {
    dom.accessPanel.classList.remove("is-denied");
    dom.keyField.classList.remove("is-error", "is-valid");
    dom.keySuffix.setAttribute("aria-invalid", "false");
    dom.formError.textContent = "";
  }

  function showError(message) {
    dom.accessPanel.classList.add("is-denied");
    dom.keySuffix.setAttribute("aria-invalid", "true");
    dom.formError.textContent = message;
    dom.keyField.classList.remove("is-error");
    // Force the shake animation to restart on every failed attempt.
    void dom.keyField.offsetWidth;
    dom.keyField.classList.add("is-error");
  }

  function errorMessage(reason) {
    if (reason === "empty") {
      return "أدخل الجزء المتبقي من المفتاح أولاً. البادئة وحدها ليست المفتاح.";
    }
    if (reason === "characters") {
      return "المفتاح يحتوي على رموز غير صالحة. استخدم أرقاماً وحروفاً من A إلى F فقط.";
    }
    if (reason === "short") {
      return "المفتاح يبدو ناقصاً… الجزء المخبأ في الثمبنيل أطول من ذلك.";
    }

    const messages = [
      "المفتاح غير صحيح. أعد النظر في الثمبنيل — التفاصيل الصغيرة هي كل شيء.",
      "ليس بعد. المفتاح مخبأ داخل الصورة، وليس في الوصف.",
      "اقترب… افتح صورة المقطع بالحجم الكامل وافحص الحواف والزوايا."
    ];

    return messages[Math.max(0, state.attempts - 1) % messages.length];
  }

  /* ============================================================
     VIEWS
     ============================================================ */

  function showView(view, options = {}) {
    const unlocked = view === "unlocked";
    state.view = view;

    dom.challengeView.hidden = unlocked;
    dom.unlockedView.hidden = !unlocked;

    document.body.classList.toggle("theme-unlocked", unlocked);
    dom.sessionStatus.textContent = unlocked ? "ACCESS GRANTED" : "SECURE CHANNEL";

    updateUrl(view);

    if (!options.instant) {
      const activeView = unlocked ? dom.unlockedView : dom.challengeView;
      activeView.classList.add("view--enter");
      window.setTimeout(() => activeView.classList.remove("view--enter"), 1200);
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const heading = unlocked ? $("#unlockedTitle") : $("#challengeTitle");
    if (heading) {
      window.setTimeout(() => {
        try {
          heading.focus({ preventScroll: true });
        } catch (_) {
          heading.focus();
        }
      }, options.instant ? 50 : 480);
    }
  }

  function applyRestoredState() {
    const restored = readAccess();
    if (restored) {
      dom.sessionStatus.textContent = "ACCESS GRANTED";
      document.body.classList.add("theme-unlocked");
    }
    return restored ? "unlocked" : "challenge";
  }

  /* ============================================================
     LOADER
     ============================================================ */

  const loaderSteps = [
    { at: 0, status: "تهيئة القناة المشفّرة…", log: "> booting saver_secure_shell..." },
    { at: 22, status: "تحميل ملف القضية 3301…", log: "> mounting encrypted_volume:/case_3301" },
    { at: 44, status: "استخراج بصمة المشغّل…", log: "> scanning operator fingerprint..." },
    { at: 66, status: "تتبّع الإشارة من الثمبنيل…", log: "> tracing signal: thumbnail_0x..." },
    { at: 84, status: "تجهيز محرك الشيفرة…", log: "> cipher_engine ready. awaiting passkey." }
  ];

  let loaderStepIndex = -1;
  let loaderRaf = 0;
  let loaderStart = 0;
  const loaderDuration = prefersReducedMotion ? 650 : 3350;

  function setLoaderProgress(value) {
    const progress = Math.max(0, Math.min(100, Math.round(value)));
    if (dom.loaderCount) dom.loaderCount.textContent = String(progress).padStart(3, "0");
    if (dom.loaderBar) dom.loaderBar.style.width = `${progress}%`;
    if (dom.loaderTrack) dom.loaderTrack.setAttribute("aria-valuenow", String(progress));

    if (progress >= 100) {
      if (dom.loaderLog) dom.loaderLog.textContent = "> handshake_complete. welcome, operative.";
    }
  }

  function updateLoaderStep(progress) {
    let nextIndex = 0;
    for (let index = 0; index < loaderSteps.length; index += 1) {
      if (progress >= loaderSteps[index].at) nextIndex = index;
    }

    if (nextIndex === loaderStepIndex) return;
    loaderStepIndex = nextIndex;

    const step = loaderSteps[nextIndex];
    if (dom.loaderStatus) dom.loaderStatus.textContent = step.status;
    if (dom.loaderLog) dom.loaderLog.textContent = step.log;
  }

  function finishLoader(skipped = false) {
    if (state.loaderFinished) return;
    state.loaderFinished = true;

    window.cancelAnimationFrame(loaderRaf);

    setLoaderProgress(100);
    if (dom.loaderStatus) {
      dom.loaderStatus.textContent = skipped
        ? "تم تجاوز المقدمة — جارٍ فتح الملف…"
        : "تم منح الوصول — افتح عينيك.";
    }

    dom.loader.classList.add("is-complete");

    window.setTimeout(() => {
      dom.loader.classList.add("is-exit");
      document.documentElement.classList.remove("is-loading");
      dom.app.classList.add("is-ready");
      dom.app.inert = false;

      // استعادة الجلسة الموثقة أو فتح شاشة المفتاح
      showView(applyRestoredState(), { instant: true });
    }, prefersReducedMotion ? 60 : 620);

    window.setTimeout(() => {
      dom.loader.hidden = true;
      dom.loader.setAttribute("aria-hidden", "true");
    }, prefersReducedMotion ? 250 : 1600);
  }

  function runLoader() {
    if (!dom.loader) return;

    if (dom.skipIntro) {
      dom.skipIntro.addEventListener("click", () => finishLoader(true));
    }

    if (prefersReducedMotion) {
      setLoaderProgress(100);
      window.setTimeout(() => finishLoader(), 500);
      return;
    }

    loaderStart = performance.now();

    const tick = (now) => {
      if (state.loaderFinished) return;

      const elapsed = now - loaderStart;
      const raw = Math.min(elapsed / loaderDuration, 1);
      const eased = 1 - Math.pow(1 - raw, 3);
      const progress = eased * 100;

      setLoaderProgress(progress);
      updateLoaderStep(progress);

      if (raw < 1) {
        loaderRaf = window.requestAnimationFrame(tick);
      } else {
        finishLoader();
      }
    };

    loaderRaf = window.requestAnimationFrame(tick);
  }

  /* ============================================================
     FORM / ACCESS
     ============================================================ */

  function resetChallenge() {
    state.attempts = 0;
    state.verifying = false;
    dom.keySuffix.value = "";
    dom.keySuffix.disabled = false;
    dom.submitBtn.disabled = false;
    dom.submitBtn.classList.remove("is-loading");
    dom.submitLabel.textContent = "فكّ الشيفرة";
    dom.accessPanel.classList.remove("is-denied");
    dom.keyField.classList.remove("is-error", "is-valid");
    dom.formError.textContent = "";
    dom.keySuffix.setAttribute("aria-invalid", "false");
    dom.hintTrigger.classList.remove("is-glowing");
    setTerminalStatus("AWAITING KEY");
    setConsole("awaiting_operator_input");
  }

  function handleKeyInput() {
    const input = dom.keySuffix;
    const cursor = input.selectionStart;
    const cleaned = input.value.replace(/\s+/g, "").toUpperCase();
    if (input.value !== cleaned) {
      input.value = cleaned;
      try {
        input.setSelectionRange(cursor, cursor);
      } catch (_) {
        /* noop */
      }
    }

    clearError();
    if (!state.verifying) {
      setTerminalStatus("AWAITING KEY");
      setConsole("awaiting_operator_input");
    }
  }

  function beginVerification(event) {
    event.preventDefault();
    if (state.verifying || state.transitioning) return;

    clearError();

    const suffix = normalizeKey(dom.keySuffix.value);
    if (!suffix) {
      state.attempts += 1;
      showError(errorMessage("empty"));
      setTerminalStatus("KEY REJECTED", "denied");
      setConsole("access_denied // empty_key", "denied");
      playDenied();
      dom.keySuffix.focus();
      return;
    }

    if (!/^[0-9A-F]+$/.test(suffix)) {
      state.attempts += 1;
      showError(errorMessage("characters"));
      setTerminalStatus("FORMAT ERROR", "denied");
      setConsole("access_denied // invalid_format", "denied");
      playDenied();
      dom.keySuffix.focus();
      return;
    }

    state.verifying = true;
    dom.submitBtn.classList.add("is-loading");
    dom.submitBtn.disabled = true;
    dom.keySuffix.disabled = true;
    dom.submitLabel.textContent = "جارٍ التحقق…";
    setTerminalStatus("VERIFYING KEY…", "verifying");
    setConsole("verifying_cipher_signature...");
    playClick(430);

    const checkDelay = prefersReducedMotion ? 240 : 760;

    window.setTimeout(() => {
      const result = validateSuffix(suffix);
      state.verifying = false;

      dom.submitBtn.classList.remove("is-loading");
      dom.submitBtn.disabled = false;
      dom.keySuffix.disabled = false;
      dom.submitLabel.textContent = "فكّ الشيفرة";

      if (result.ok) {
        handleGranted(result);
        return;
      }

      state.attempts += 1;
      dom.keyField.classList.remove("is-valid");
      showError(errorMessage(result.reason));
      setTerminalStatus("KEY REJECTED", "denied");
      setConsole(`access_denied // attempt_${String(state.attempts).padStart(2, "0")}`, "denied");
      playDenied();
      dom.keySuffix.focus();
      dom.keySuffix.select();

      if (state.attempts >= 2) {
        dom.hintTrigger.classList.add("is-glowing");
      }
    }, checkDelay);
  }

  function handleGranted(result) {
    state.transitioning = true;
    dom.keyField.classList.remove("is-error");
    dom.keyField.classList.add("is-valid");
    dom.accessPanel.classList.remove("is-denied");
    dom.formError.textContent = "";
    dom.keySuffix.setAttribute("aria-invalid", "false");
    setTerminalStatus("ACCESS GRANTED", "granted");
    setConsole(`access_granted // ${result.strict ? "master_key" : "hex_signature"} accepted`, "granted");
    dom.submitLabel.textContent = "تم التحقق";
    dom.submitBtn.classList.add("is-loading");
    dom.submitBtn.disabled = true;

    saveAccess(true);
    playSuccess();

    document.body.classList.add("is-transitioning");
    dom.transition.classList.add("is-active");

    scrambleText(dom.transitionText, "ACCESS GRANTED", prefersReducedMotion ? 0 : 900);

    const revealDelay = prefersReducedMotion ? 450 : 1420;
    const hideDelay = prefersReducedMotion ? 550 : 1850;

    window.setTimeout(() => {
      showView("unlocked");
      document.body.classList.remove("is-transitioning");
    }, revealDelay);

    window.setTimeout(() => {
      dom.transition.classList.remove("is-active");
      state.transitioning = false;
    }, hideDelay);
  }

  function lockSession() {
    saveAccess(false);
    dom.transition.classList.remove("is-active");
    document.body.classList.remove("is-transitioning");
    resetChallenge();
    showView("challenge");
    showToast("تم إنهاء الجلسة — انتهى الأثر، لكن اللغز باقٍ.");
    playClick(300);
  }

  /* ============================================================
     TRANSITION TEXT SCRAMBLE
     ============================================================ */

  function scrambleText(element, finalText, duration) {
    if (!element) return;

    if (!duration) {
      element.textContent = finalText;
      element.setAttribute("data-text", finalText);
      return;
    }

    const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/%";
    const startedAt = performance.now();

    const frame = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const revealed = Math.floor(progress * finalText.length);

      let output = "";
      for (let index = 0; index < finalText.length; index += 1) {
        const char = finalText[index];
        if (char === " ") {
          output += " ";
        } else if (index < revealed) {
          output += char;
        } else {
          output += glyphs[Math.floor(Math.random() * glyphs.length)];
        }
      }

      element.textContent = output;

      if (progress < 1) {
        window.requestAnimationFrame(frame);
      } else {
        element.textContent = finalText;
        element.setAttribute("data-text", finalText);
      }
    };

    window.requestAnimationFrame(frame);
  }

  /* ============================================================
     HINT MODAL
     ============================================================ */

  function getModalFocusables() {
    if (!dom.hintModal) return [];
    return $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', dom.hintModal)
      .filter((element) => !element.disabled && element.getClientRects().length > 0);
  }

  function openHint() {
    if (!dom.hintModal) return;

    state.lastFocused = document.activeElement;
    dom.hintModal.classList.add("is-open");
    dom.hintModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    dom.app.inert = true;
    playClick(520);

    window.setTimeout(() => {
      const closeButton = $(".modal__close", dom.hintModal);
      if (closeButton) closeButton.focus();
    }, 80);
  }

  function closeHint() {
    if (!dom.hintModal || !dom.hintModal.classList.contains("is-open")) return;

    dom.hintModal.classList.remove("is-open");
    dom.hintModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    dom.app.inert = false;

    if (state.lastFocused && typeof state.lastFocused.focus === "function") {
      try {
        state.lastFocused.focus({ preventScroll: true });
      } catch (_) {
        state.lastFocused.focus();
      }
    }
  }

  function handleModalKeydown(event) {
    if (!dom.hintModal || !dom.hintModal.classList.contains("is-open")) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeHint();
      return;
    }

    if (event.key !== "Tab") return;

    const focusables = getModalFocusables();
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ============================================================
     COPY + TOAST
     ============================================================ */

  function renderProof() {
    if (!dom.proofText) return;
    dom.proofText.textContent = CONFIG.proofText;
    dom.proofText.setAttribute("data-copy", CONFIG.proofText);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {
      /* fall through to legacy copy */
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);

    let copied = false;
    try {
      textarea.focus();
      textarea.select();
      copied = document.execCommand("copy");
    } catch (_) {
      copied = false;
    }

    textarea.remove();
    return copied;
  }

  function selectProofText() {
    if (!dom.proofText) return;

    try {
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(dom.proofText);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (_) {
      /* ignore selection errors */
    }
  }

  async function handleCopy() {
    if (!dom.copyProof) return;

    const text = CONFIG.proofText;
    const copied = await copyText(text);

    if (!copied) {
      selectProofText();
      showToast("تعذّر النسخ تلقائياً — حدّدنا لك النص، انسخه يدوياً.");
      return;
    }

    dom.copyProof.classList.add("is-copied");
    dom.copyLabel.textContent = "تم النسخ";
    showToast("تم النسخ — أراهن أنهم سيلاحظونك في التعليقات.");
    playClick(700);

    window.setTimeout(() => {
      dom.copyProof.classList.remove("is-copied");
      dom.copyLabel.textContent = "انسخ النص";
    }, 2400);
  }

  function showToast(message) {
    if (!dom.toast) return;
    window.clearTimeout(state.toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add("is-visible");
    state.toastTimer = window.setTimeout(() => {
      dom.toast.classList.remove("is-visible");
    }, 3600);
  }

  /* ============================================================
     SOUND — optional, generated in-browser
     ============================================================ */

  const Sound = {
    ctx: null,
    master: null,
    drone: null,
    enabled: false,

    init() {
      if (this.ctx) return true;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;

      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.0001;
        this.master.connect(this.ctx.destination);
        return true;
      } catch (_) {
        return false;
      }
    },

    buildDrone() {
      if (!this.ctx || this.drone) return;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 185;
      filter.Q.value = 0.7;

      const droneGain = this.ctx.createGain();
      droneGain.gain.value = 0.09;

      const low = this.ctx.createOscillator();
      low.type = "sine";
      low.frequency.value = 48;

      const high = this.ctx.createOscillator();
      high.type = "triangle";
      high.frequency.value = 72.5;

      const highGain = this.ctx.createGain();
      highGain.gain.value = 0.42;

      const lfo = this.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.08;

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 24;
      lfo.connect(lfoGain).connect(filter.frequency);

      low.connect(filter);
      high.connect(highGain).connect(filter);
      filter.connect(droneGain).connect(this.master);

      low.start();
      high.start();
      lfo.start();

      this.drone = { low, high, lfo, droneGain, filter };
    },

    async toggle() {
      if (!this.init()) return false;

      try {
        if (this.ctx.state === "suspended") await this.ctx.resume();
      } catch (_) {
        return false;
      }

      this.enabled = !this.enabled;
      this.buildDrone();

      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.enabled ? 0.15 : 0.0001, now, 0.22);

      if (this.enabled) {
        window.setTimeout(() => this.blip(620, 0.06, "sine", 0.018), 90);
      }

      return this.enabled;
    },

    blip(frequency = 520, duration = 0.06, type = "sine", volume = 0.035) {
      if (!this.ctx || !this.enabled) return;

      try {
        const now = this.ctx.currentTime;
        const oscillator = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, now);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        oscillator.connect(gain).connect(this.master);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.02);
      } catch (_) {
        /* ignore audio graph errors */
      }
    },

    denied() {
      if (!this.ctx || !this.enabled) return;
      this.blip(128, 0.18, "sawtooth", 0.022);
    },

    success() {
      if (!this.ctx || !this.enabled) return;

      try {
        const now = this.ctx.currentTime;

        const boom = this.ctx.createOscillator();
        const boomGain = this.ctx.createGain();
        boom.type = "sine";
        boom.frequency.setValueAtTime(74, now);
        boom.frequency.exponentialRampToValueAtTime(38, now + 0.65);
        boomGain.gain.setValueAtTime(0.09, now);
        boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
        boom.connect(boomGain).connect(this.master);
        boom.start(now);
        boom.stop(now + 0.85);

        window.setTimeout(() => this.blip(660, 0.16, "sine", 0.025), 120);
        window.setTimeout(() => this.blip(990, 0.24, "sine", 0.018), 260);
      } catch (_) {
        /* ignore audio graph errors */
      }
    }
  };

  function playClick(frequency) {
    Sound.blip(frequency || 470, 0.045, "sine", 0.02);
  }

  function playDenied() {
    Sound.denied();
  }

  function playSuccess() {
    Sound.success();
  }

  function updateSoundUi(enabled) {
    if (!dom.soundToggle) return;
    dom.soundToggle.setAttribute("aria-pressed", String(enabled));
    dom.soundToggle.setAttribute("aria-label", enabled ? "إيقاف الصوت" : "تشغيل الصوت");
    dom.soundToggle.querySelector(".sound-toggle__label").textContent = enabled ? "الصوت مفعّل" : "الصوت";

    const use = dom.soundToggle.querySelector("use");
    if (use) use.setAttribute("href", enabled ? "#icon-volume" : "#icon-volume-off");
  }

  async function toggleSound() {
    const enabled = await Sound.toggle();
    updateSoundUi(enabled);

    if (enabled) {
      showToast("الصوت مفعّل — صوت خفيف، بلا ضجيج.");
    } else if (Sound.ctx) {
      showToast("تم إيقاف الصوت.");
    } else {
      showToast("الصوت غير مدعوم في هذا المتصفح.");
    }
  }

  /* ============================================================
     AMBIENT PARTICLES
     ============================================================ */

  function initParticles() {
    if (prefersReducedMotion) return;

    const canvas = $("#dust");
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    let raf = 0;

    const createParticle = (randomY = true) => {
      const isAsh = Math.random() > 0.78;
      return {
        x: Math.random(),
        y: randomY ? Math.random() : 1.04,
        size: isAsh ? 0.5 + Math.random() * 1.2 : 0.7 + Math.random() * 1.8,
        speed: 0.01 + Math.random() * 0.034,
        drift: (Math.random() - 0.5) * 0.0009,
        phase: Math.random() * Math.PI * 2,
        alpha: isAsh ? 0.16 + Math.random() * 0.22 : 0.3 + Math.random() * 0.42,
        ash: isAsh
      };
    };

    const resize = () => {
      const nextWidth = window.innerWidth;
      const nextHeight = window.innerHeight;
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);

      if (nextWidth === width && nextHeight === height && nextDpr === dpr) return;

      width = nextWidth;
      height = nextHeight;
      dpr = nextDpr;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const desired = Math.min(58, Math.max(24, Math.floor((width * height) / 24000)));
      particles = Array.from({ length: desired }, () => createParticle());
    };

    const draw = (time) => {
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      for (const particle of particles) {
        particle.y -= particle.speed / height * 18;
        particle.x += particle.drift + Math.sin(time * 0.0003 + particle.phase) * 0.00012;

        if (particle.y < -0.03 || particle.x < -0.03 || particle.x > 1.03) {
          Object.assign(particle, createParticle(false));
        }

        const x = particle.x * width;
        const y = particle.y * height;
        const twinkle = 0.68 + Math.sin(time * 0.0011 + particle.phase) * 0.32;

        context.beginPath();
        context.arc(x, y, particle.size, 0, Math.PI * 2);
        context.fillStyle = particle.ash
          ? `rgba(242, 233, 223, ${particle.alpha * twinkle * 0.55})`
          : `rgba(238, 22, 42, ${particle.alpha * twinkle * 0.58})`;
        context.fill();
      }

      context.globalCompositeOperation = "source-over";
      raf = window.requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    raf = window.requestAnimationFrame(draw);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        window.cancelAnimationFrame(raf);
      } else {
        window.cancelAnimationFrame(raf);
        raf = window.requestAnimationFrame(draw);
      }
    });
  }

  /* ============================================================
     UTILITIES
     ============================================================ */

  function updateClock() {
    if (!dom.utcClock) return;
    const now = new Date();
    const utc = now.toISOString().slice(11, 19);
    dom.utcClock.textContent = utc;
  }

  function initClock() {
    if (!dom.utcClock) return;
    updateClock();
    window.setInterval(updateClock, 1000);
  }

  function initScrollState() {
    const update = () => {
      if (!dom.topbar) return;
      dom.topbar.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  function initParallax() {
    if (!canHover || prefersReducedMotion || !dom.emblemStage || !dom.challengeView) return;

    let frame = 0;
    let latestEvent = null;

    dom.challengeView.addEventListener(
      "pointermove",
      (event) => {
        latestEvent = event;
        if (frame) return;

        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (!latestEvent || dom.challengeView.hidden) return;

          const rect = dom.emblemStage.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const deltaX = (latestEvent.clientX - centerX) / Math.max(1, rect.width);
          const deltaY = (latestEvent.clientY - centerY) / Math.max(1, rect.height);

          dom.emblemStage.style.setProperty("--ry", `${Math.max(-4, Math.min(4, deltaX * 7))}deg`);
          dom.emblemStage.style.setProperty("--rx", `${Math.max(-4, Math.min(4, -deltaY * 7))}deg`);
        });
      },
      { passive: true }
    );

    dom.challengeView.addEventListener(
      "pointerleave",
      () => {
        dom.emblemStage.style.setProperty("--rx", "0deg");
        dom.emblemStage.style.setProperty("--ry", "0deg");
      },
      { passive: true }
    );
  }

  /* ============================================================
     INIT
     ============================================================ */

  function bindEvents() {
    dom.keyForm.addEventListener("submit", beginVerification);
    dom.keySuffix.addEventListener("input", handleKeyInput);

    dom.keySuffix.addEventListener("paste", () => {
      window.setTimeout(handleKeyInput, 0);
    });

    dom.hintTrigger.addEventListener("click", openHint);

    dom.hintModal.addEventListener("click", (event) => {
      if (event.target.closest("[data-close='true']")) {
        closeHint();
      }
    });

    document.addEventListener("keydown", handleModalKeydown);

    dom.soundToggle.addEventListener("click", toggleSound);

    dom.copyProof.addEventListener("click", handleCopy);
    dom.lockSession.addEventListener("click", lockSession);

    dom.keySuffix.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && dom.hintModal.classList.contains("is-open")) {
        closeHint();
      }
    });
  }

  function init() {
    dom.year.textContent = String(new Date().getFullYear());
    document.documentElement.classList.add("is-loading");
    dom.app.inert = true;

    renderProof();
    bindEvents();
    initClock();
    initScrollState();
    initParallax();
    initParticles();
    updateSoundUi(false);

    const initialView = applyRestoredState();
    state.view = initialView;

    // If the URL points at #unlocked but the session is not verified, close it.
    if (initialView !== "unlocked" && window.location.hash === "#unlocked") {
      updateUrl("challenge");
    }

    resetChallenge();
    runLoader();
  }

  init();
})();
