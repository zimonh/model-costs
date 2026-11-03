// Google Analytics through zimonh/consent (/consent.js, a copy of ~/Sites/consent/dist/consent.js): the one banner
// and loader all of Simon's sites share. GA loads only after the visitor says yes, and only on apicost.app itself.
// Every page includes this file; it loads /consent.js itself, so the pages need no second script tag.
//
// Pages report events with window.track(name, params). Before a yes it does nothing. On localhost and other hosts
// there is no banner; after a yes in the per-site panel ("Cookie settings" in the footer) events go to the console
// instead of to Google, so they can be checked locally.
(() => {
  // The GA4 measurement ID. While it is "G-PENDING" this script does nothing: no banner, no cookie settings link, no events.
  const MEASUREMENT_ID = "G-SJDZXFFW62";
  const PRODUCTION = location.hostname === "apicost.app";

  window.track = () => {};
  if (MEASUREMENT_ID === "G-PENDING") return;

  const path = location.pathname;
  const SECTION =
    path === "/" || path === "/index.html" ? "calculator"
    : path.startsWith("/token-counter/") ? "token_counter"
    : path.startsWith("/pricing/") ? "pricing"
    : path.startsWith("/privacy/") ? "privacy"
    : "other";

  let consent = null;

  window.track = (name, params = {}) => {
    if (!consent || consent.getConsent() !== "granted") return;
    const event = { site_section: SECTION, ...params };
    if (PRODUCTION) consent.track(name, event);
    else console.debug("[analytics]", name, event);
  };

  function start() {
    consent = window.zimonhConsent;
    if (!consent) return;
    // apicost.consent: the choice from before zimonh/consent, so nobody is asked twice
    consent.init({ site: "apicost", ids: PRODUCTION ? [MEASUREMENT_ID] : [], lang: "en", privacyUrl: "/privacy/", legacyKey: "apicost.consent", params: { site_section: SECTION } });
    // The footer link is hidden until the banner code is there, so it never opens nothing.
    document.querySelectorAll(".cookie-settings").forEach((el) => (el.hidden = false));
  }

  const script = document.createElement("script");
  script.src = "/consent.js?v=1";
  script.onload = start;
  document.head.appendChild(script);

  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[href]");
    if (!link) return;
    if (link.getAttribute("href") === "#cookie-settings") {
      e.preventDefault();
      if (consent) consent.openSettings();
      return;
    }
    // Outbound links: provider pricing pages, GitHub, LiteLLM.
    if (/^https?:$/.test(link.protocol) && link.hostname !== location.hostname) {
      window.track("click", { link_domain: link.hostname, link_url: link.origin + link.pathname, outbound: true });
    }
  });
})();
