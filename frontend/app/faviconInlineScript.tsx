/**
 * Paste this dangerouslySetInnerHTML script into your root layout <head>.
 * It applies the cached favicon BEFORE React hydrates, eliminating any flash.
 *
 * Security: we can't do async crypto here (no await in inline scripts),
 * so we do a lightweight structural validation:
 *  - Must be exactly one entry (LS_KEY)
 *  - Must start with https://
 *  - Must not contain < > " ' ` ; ( ) to block XSS payloads
 *  - Signature verification happens later in FaviconUpdater.tsx (async)
 */
const inlineScript = `
(function() {
  try {
    var url = localStorage.getItem('favicon_v2');
    if (!url) return;
    // Structural guard: only absolute https URLs, no injection chars
    if (!/^https:\\/\\/[^<>"'\`\\s;()]{4,}$/.test(url)) {
      localStorage.removeItem('favicon_v2');
      localStorage.removeItem('favicon_v2_sig');
      return;
    }
    var link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = url;
  } catch(e) {}
})();
`;