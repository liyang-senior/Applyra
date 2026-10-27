const API = "http://localhost:3000";
const COOKIE = "applyra_session";
const TOKEN_KEY = "applyraToken";
const REMEMBER_KEY = "applyraRemember";
const WEEK_SECONDS = 60 * 60 * 24 * 7;

const tabs = document.querySelector(".tabs");
const tabSignin = document.querySelector("#tab-signin");
const tabSignup = document.querySelector("#tab-signup");
const pageSignin = document.querySelector("#page-signin");
const pageSignup = document.querySelector("#page-signup");
const signinForm = document.querySelector("#signin-form");
const signupForm = document.querySelector("#signup-form");
const signinEmail = document.querySelector("#signin-email");
const signinPassword = document.querySelector("#signin-password");
const rememberInput = document.querySelector("#remember");
const signinSwitch = document.querySelector("#signin-switch");
const signupName = document.querySelector("#signup-name");
const signupEmail = document.querySelector("#signup-email");
const signupPassword = document.querySelector("#signup-password");
const signupConfirm = document.querySelector("#signup-confirm");
const signinButton = document.querySelector("#signin");
const signupButton = document.querySelector("#signup");
const arrowButton = document.querySelector("#arrow");
const dashboardButton = document.querySelector("#dashboard");
const sessionLine = document.querySelector("#session");
const toast = document.querySelector("#toast");
const eyeButtons = document.querySelectorAll(".eye");

let account = null;
let pending = false;
let page = "signin";
let remembered = { email: "", password: "" };
let toastTimer = 0;

function showMessage(text, kind) {
  window.clearTimeout(toastTimer);
  if (!text) {
    toast.hidden = true;
    toast.innerHTML = "";
    toast.className = "toast";
    return;
  }

  const ok = kind !== "error";
  toast.hidden = false;
  toast.className = `toast ${ok ? "ok" : "error"}`;
  toast.setAttribute("role", ok ? "status" : "alert");
  toast.innerHTML = `
    <span class="mark" aria-hidden="true">${ok ? "✓" : "!"}</span>
    <span class="text"></span>
    <button class="close" type="button" aria-label="Dismiss">×</button>
  `;
  toast.querySelector(".text").textContent = text;
  toast.querySelector(".close").addEventListener("click", () => showMessage(""));
  toastTimer = window.setTimeout(() => showMessage(""), 3200);
}

function setPage(next) {
  page = next === "signup" ? "signup" : "signin";
  renderAccount();
}

function setPending(next) {
  pending = next || false;
  renderAccount();
}

function renderAccount() {
  const signedIn = Boolean(account);
  const onSignup = !signedIn && page === "signup";

  sessionLine.hidden = !signedIn;
  sessionLine.textContent = signedIn
    ? `Signed in as ${account.name || account.email}`
    : "";

  tabs.hidden = signedIn;
  tabSignin.setAttribute("aria-selected", !onSignup ? "true" : "false");
  tabSignup.setAttribute("aria-selected", onSignup ? "true" : "false");
  tabSignup.disabled = signedIn;

  pageSignin.hidden = onSignup;
  pageSignup.hidden = !onSignup;

  signinEmail.disabled = signedIn || Boolean(pending);
  signinPassword.disabled = signedIn || Boolean(pending);
  signupName.disabled = Boolean(pending);
  signupEmail.disabled = Boolean(pending);
  signupPassword.disabled = Boolean(pending);
  signupConfirm.disabled = Boolean(pending);
  eyeButtons.forEach((button) => {
    const onSigninFields = String(button.dataset.target || "").startsWith("signin");
    button.disabled = Boolean(pending) || (signedIn && onSigninFields);
  });

  signupButton.disabled = Boolean(pending);
  signinButton.disabled = Boolean(pending);

  arrowButton.hidden = !signedIn;
  signinSwitch.hidden = signedIn;
  rememberInput.closest(".remember").hidden = signedIn;
  rememberInput.disabled = signedIn || Boolean(pending);

  if (signedIn) {
    signinEmail.value = account.email;
    signinPassword.value = "";
    signinButton.type = "button";
    signinButton.classList.add("danger");
    signinButton.classList.remove("primary");
    signinButton.textContent =
      pending === "signout" ? "Signing out…" : "Sign out";
  } else {
    signinButton.type = "submit";
    signinButton.classList.add("primary");
    signinButton.classList.remove("danger");
    signinButton.textContent =
      pending === "signin" ? "Signing in…" : "Sign in";
    signupButton.textContent =
      pending === "signup" ? "Signing up…" : "Sign up";
  }
}

async function loadRemembered() {
  const stored = await chrome.storage.local.get(REMEMBER_KEY);
  const data = stored[REMEMBER_KEY];
  if (!data || typeof data !== "object") return;
  remembered = {
    email: String(data.email || ""),
    password: String(data.password || ""),
  };
  if (remembered.email || remembered.password) {
    rememberInput.checked = true;
    if (!account) {
      signinEmail.value = remembered.email;
      signinPassword.value = remembered.password;
    }
  }
}

async function persistRemembered(email, password) {
  if (rememberInput.checked) {
    remembered = { email, password };
    await chrome.storage.local.set({ [REMEMBER_KEY]: remembered });
    return;
  }
  remembered = { email: "", password: "" };
  await chrome.storage.local.remove(REMEMBER_KEY);
}

async function readError(response) {
  try {
    const data = await response.json();
    return data.error || "Something went wrong. Try again.";
  } catch {
    return "Something went wrong. Try again.";
  }
}

async function savedToken() {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  return stored[TOKEN_KEY] || "";
}

async function saveToken(token) {
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}

async function clearToken() {
  await chrome.storage.local.remove(TOKEN_KEY);
}

async function connectCookie(token) {
  const cookie = await chrome.cookies.set({
    url: `${API}/`,
    name: COOKIE,
    value: token,
    path: "/",
    secure: false,
    httpOnly: true,
    sameSite: "lax",
    expirationDate: Math.floor(Date.now() / 1000) + WEEK_SECONDS,
  });
  if (!cookie) {
    throw new Error("Applyra could not store the sign-in on this browser.");
  }
}

async function removeCookie() {
  await chrome.cookies.remove({ url: `${API}/`, name: COOKIE });
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("X-Applyra-Client", "extension");
  const token = await savedToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body) headers.set("Content-Type", "application/json");
  return fetch(`${API}${path}`, {
    ...options,
    headers,
  });
}

async function refreshAccount() {
  try {
    const token = await savedToken();
    if (!token) {
      account = null;
      setPage(page);
      return;
    }

    const response = await api("/api/auth/me");
    if (!response.ok) {
      account = null;
      await clearToken();
      await removeCookie();
      setPage("signin");
      return;
    }

    const data = await response.json();
    account = data.account;
    await connectCookie(token);
    setPage("signin");
  } catch {
    showMessage("Start Applyra at localhost:3000, then open this again.", "error");
  }
}

async function signOut() {
  setPending("signout");
  try {
    await api("/api/auth/signout", { method: "POST" });
  } finally {
    await clearToken();
    await removeCookie();
    await chrome.storage.local.set({ sidebarOpen: false });
    account = null;
    setPending(false);
    setPage("signin");
    if (rememberInput.checked && remembered.email) {
      signinEmail.value = remembered.email;
      signinPassword.value = remembered.password;
    } else {
      signinPassword.value = "";
    }
    showMessage("Signed out.", "ok");
  }
}

async function submitSignIn() {
  if (account) return;
  showMessage("");
  const email = signinEmail.value.trim();
  if (!email) {
    showMessage("Enter an email address.", "error");
    return;
  }
  if (signinPassword.value.length < 8) {
    showMessage("Use a password of at least 8 characters.", "error");
    return;
  }

  setPending("signin");
  try {
    const response = await api("/api/auth/signin", {
      method: "POST",
      body: JSON.stringify({ email, password: signinPassword.value }),
    });
    if (!response.ok) {
      showMessage(await readError(response), "error");
      return;
    }
    const data = await response.json();
    await saveToken(data.token);
    await connectCookie(data.token);
    await persistRemembered(email, signinPassword.value);
    account = data.account;
    setPage("signin");
    showMessage("Signed in.", "ok");
  } catch (error) {
    showMessage(
      error instanceof Error ? error.message : "Something went wrong. Try again.",
      "error",
    );
  } finally {
    setPending(false);
  }
}

async function submitSignUp() {
  if (account) return;
  showMessage("");
  const name = signupName.value.trim();
  const email = signupEmail.value.trim();
  if (!name) {
    showMessage("Enter a name.", "error");
    return;
  }
  if (!email) {
    showMessage("Enter an email address.", "error");
    return;
  }
  if (signupPassword.value.length < 8) {
    showMessage("Use a password of at least 8 characters.", "error");
    return;
  }
  if (!signupConfirm.value) {
    showMessage("Confirm your password.", "error");
    return;
  }
  if (signupConfirm.value !== signupPassword.value) {
    showMessage("Passwords do not match.", "error");
    return;
  }

  setPending("signup");
  try {
    const response = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name,
        email,
        password: signupPassword.value,
      }),
    });
    if (!response.ok) {
      showMessage(await readError(response), "error");
      return;
    }
    const data = await response.json();
    await saveToken(data.token);
    await connectCookie(data.token);
    account = data.account;
    signupPassword.value = "";
    signupConfirm.value = "";
    setPage("signin");
    showMessage("Account created.", "ok");
  } catch (error) {
    showMessage(
      error instanceof Error ? error.message : "Something went wrong. Try again.",
      "error",
    );
  } finally {
    setPending(false);
  }
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "sidebar-state" });
    return true;
  } catch {
    // Content script missing — inject below.
  }
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content.css"],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    return true;
  } catch {
    return false;
  }
}

function syncArrowButton(visible) {
  const on = visible !== false;
  arrowButton.setAttribute("aria-pressed", on ? "true" : "false");
  arrowButton.textContent = on ? "Hide page arrow" : "Show page arrow";
}

async function setArrowEverywhere(visible) {
  await chrome.storage.local.set({
    sidebarArrowVisible: visible,
    ...(visible ? {} : { sidebarOpen: false }),
  });
  syncArrowButton(visible);
  const tabsList = await chrome.tabs.query({});
  await Promise.all(
    tabsList.map(async (tab) => {
      if (!tab.id) return;
      const ready = await ensureContentScript(tab.id);
      if (!ready) return;
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "set-arrow",
          visible,
        });
      } catch {
        // Restricted pages (chrome://, etc.).
      }
    }),
  );
}

async function syncSidebar() {
  const stored = await chrome.storage.local.get("sidebarArrowVisible");
  syncArrowButton(stored.sidebarArrowVisible !== false);
}

tabSignin.addEventListener("click", () => setPage("signin"));
tabSignup.addEventListener("click", () => setPage("signup"));
document.querySelector("#goto-signup").addEventListener("click", () => setPage("signup"));
document.querySelector("#goto-signin").addEventListener("click", () => setPage("signin"));

signinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (account) {
    void signOut();
    return;
  }
  void submitSignIn();
});

signupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitSignUp();
});

signinButton.addEventListener("click", (event) => {
  if (!account) return;
  event.preventDefault();
  void signOut();
});

eyeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.target);
    const showing = input.type === "password";
    input.type = showing ? "text" : "password";
    button.setAttribute("aria-pressed", showing ? "true" : "false");
    button.setAttribute(
      "aria-label",
      showing
        ? `Hide ${button.dataset.target.includes("confirm") ? "confirm password" : "password"}`
        : `Show ${button.dataset.target.includes("confirm") ? "confirm password" : "password"}`,
    );
  });
});

arrowButton.addEventListener("click", async () => {
  showMessage("");
  const stored = await chrome.storage.local.get("sidebarArrowVisible");
  const next = stored.sidebarArrowVisible === false;
  await setArrowEverywhere(next);
  showMessage(next ? "Page arrow shown." : "Page arrow hidden.", "ok");
});

dashboardButton.addEventListener("click", () => {
  void chrome.tabs.create({ url: `${API}/dashboard` });
});

void loadRemembered()
  .then(() => refreshAccount())
  .then(syncSidebar);
