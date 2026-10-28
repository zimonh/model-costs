// Google Analytics, loaded only after the visitor presses Allow in the cookie
// banner, and only on apicost.app itself. Every page includes this file.
//
// Pages report events with window.track(name, params). Before Allow, and while
// MEASUREMENT_ID is still "G-PENDING", track() does nothing. On localhost and
// other hosts it logs the event to the console after Allow instead of sending
// it, so events can be checked locally.
//
// The choice lives in localStorage under "apicost.consent": "granted" or
// "denied". The "Cookie settings" link in the footer opens the banner again.
(() => {
  // The GA4 measurement ID. While it is "G-PENDING" this script does nothing:
  // no banner, no cookie settings link, no events.
  const MEASUREMENT_ID = "G-SJDZXFFW62";
  const CONSENT_KEY = "apicost.consent";
  const PRODUCTION = location.hostname === "apicost.app";
  const DEBUG = new URLSearchParams(location.search).has("debug_mode");

  window.track = () => {};
  if (MEASUREMENT_ID === "G-PENDING") return;

  const read = () => {
    try {
      return localStorage.getItem(CONSENT_KEY);
    } catch {
      return null;
    }
  };
  const write = (value) => {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {}
  };

  const path = location.pathname;
  const SECTION =
    path === "/" || path === "/index.html" ? "calculator"
    : path.startsWith("/token-counter/") ? "token_counter"
    : path.startsWith("/pricing/") ? "pricing"
    : path.startsWith("/privacy/") ? "privacy"
    : "other";

  // ---------- Google Analytics ----------

  let loaded = false;

  function start() {
    if (!PRODUCTION) return;
    window[`ga-disable-${MEASUREMENT_ID}`] = false;
    if (loaded) {
      gtag("consent", "update", { analytics_storage: "granted" });
      return;
    }
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      dataLayer.push(arguments);
    };
    // We run no ads, so everything but analytics stays denied.
    gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    gtag("js", new Date());
    // Any debug_mode value turns DebugView on, so only pass it when asked for.
    gtag("config", MEASUREMENT_ID, { site_section: SECTION, ...(DEBUG && { debug_mode: true }) });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(script);
  }

  function stop() {
    window[`ga-disable-${MEASUREMENT_ID}`] = true;
    if (loaded) gtag("consent", "update", { analytics_storage: "denied" });
    // Remove the cookies Google Analytics set, on this host and its parent domain.
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0].trim();
      if (name !== "_ga" && !name.startsWith("_ga_")) continue;
      for (const domain of ["", `; domain=.${location.hostname}`]) document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
    }
  }

  window.track = (name, params = {}) => {
    if (read() !== "granted") return;
    const event = { site_section: SECTION, ...params };
    if (PRODUCTION) {
      if (loaded) gtag("event", name, event);
    } else {
      console.debug("[analytics]", name, event);
    }
  };

  // ---------- Banner ----------

  const CSS = `
.consent { position: fixed; z-index: 50; right: 16px; bottom: 16px; left: 16px; max-width: 420px; margin-left: auto; padding: 16px 18px; background: var(--surface, #fff); color: var(--text, #14171c); border: 1px solid var(--border, #e2e5ea); border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,.18); font-size: .88rem; line-height: 1.5; }
.consent[hidden] { display: none; }
.consent p { margin: 0 0 12px; }
.consent-actions { display: flex; gap: 8px; }
.consent-actions button { flex: 1; font: inherit; font-weight: 600; cursor: pointer; border-radius: 9px; padding: 8px 12px; border: 1px solid var(--border, #e2e5ea); background: var(--surface-2, #f1f3f6); color: var(--text, #14171c); }
.consent-actions button:hover { border-color: var(--text, #14171c); }
`;

  let banner = null;

  function showBanner() {
    if (!banner) {
      const style = document.createElement("style");
      style.textContent = CSS;
      document.head.appendChild(style);
      banner = document.createElement("div");
      banner.className = "consent";
      banner.setAttribute("role", "region");
      banner.setAttribute("aria-label", "Cookie consent");
      banner.innerHTML = `
        <p>Can we use Google Analytics to see which models and pages people use? Nothing is collected unless you allow it, and the text you paste is never sent. <a href="/privacy/">Privacy</a></p>
        <div class="consent-actions">
          <button type="button" data-consent="granted">Allow</button>
          <button type="button" data-consent="denied">No thanks</button>
        </div>`;
      banner.addEventListener("click", (e) => {
        const button = e.target.closest("[data-consent]");
        if (button) choose(button.dataset.consent);
      });
      document.body.appendChild(banner);
    }
    banner.hidden = false;
  }

  function choose(value) {
    write(value);
    banner.hidden = true;
    if (value === "granted") start();
    else stop();
  }

  // ---------- Page wiring ----------

  function init() {
    const choice = read();
    if (choice === "granted") start();
    else if (choice !== "denied") showBanner();

    // The footer link is hidden until analytics is live, so it never opens an empty choice.
    document.querySelectorAll(".cookie-settings").forEach((el) => (el.hidden = false));

    document.addEventListener("click", (e) => {
      const link = e.target.closest("a[href]");
      if (!link) return;
      if (link.getAttribute("href") === "#cookie-settings") {
        e.preventDefault();
        showBanner();
        banner.querySelector("button").focus();
        return;
      }
      // Outbound links: provider pricing pages, GitHub, LiteLLM.
      if (/^https?:$/.test(link.protocol) && link.hostname !== location.hostname) {
        window.track("click", { link_domain: link.hostname, link_url: link.origin + link.pathname, outbound: true });
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
