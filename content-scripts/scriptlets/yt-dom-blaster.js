// yt-dom-blaster.js (Runs in standard Content Script context)
(() => {
  'use strict';

  let videoObserver = null;
  let isProcessing = false;

  const purgeYouTubeAds = () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
      const isAdShowing = document.querySelector('.ad-showing, .ad-interrupting, .ytp-ad-player-overlay, .ytp-ad-module, [class*="ad-showing"], [class*="ad-interrupting"]');

      // 1. Instant Skip / Fast-Forward
      if (isAdShowing && video) {
        video.muted = true;
        video.playbackRate = 16.0; // Max browser playback speed

        // Seek to the end of non-live ad segments instantly
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = video.duration - 0.1;
        }
      }

      // 2. Click all modern skip buttons immediately
      const skipSelectors = [
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        '.ytp-ad-skip-button-slot',
        '.ytp-ad-overlay-close-button',
        'button[aria-label*="Skip" i]',
        'button[aria-label*="skip" i]'
      ];
      for (const selector of skipSelectors) {
        const btn = document.querySelector(selector);
        if (btn) {
          btn.click();
          console.log('[AeroGuard] Clicked skip button:', selector);
        }
      }

      // 3. Nuke Anti-Adblock Popups & Unfreeze Video
      const antiAdblockPopup = document.querySelector(
        'ytd-enforcement-message-view-model, ' +
        'tp-yt-paper-dialog:has(#dismiss-button), ' +
        'ytd-popup-container ytd-enforcement-message-view-model, ' +
        '#dismiss-button'
      );
      const backdrop = document.querySelector('tp-yt-iron-overlay-backdrop');

      if (antiAdblockPopup) {
        antiAdblockPopup.remove();
        if (backdrop) backdrop.remove();
        if (video && video.paused) {
          video.play().catch(() => {});
        }
        console.log('[AeroGuard] Removed anti-adblock enforcement popup');
      }

      // 4. Remove ad overlay elements
      const adOverlaySelectors = [
        '.ytp-ad-player-overlay',
        '.ytp-ad-player-overlay-instream',
        '.ytp-ad-player-overlay-layout',
        '.ytp-ad-image-overlay',
        '.ytp-ad-text-overlay',
        '.ytp-ad-branding-overlay',
        '.ytp-ad-preview-container',
        '.ytp-ad-progress-bar-container',
        '.video-ads',
        '.ad-showing',
        '.ad-container',
        '.ad-banner'
      ];
      for (const selector of adOverlaySelectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.style.display !== 'none') {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('opacity', '0', 'important');
            el.style.setProperty('height', '0', 'important');
            el.style.setProperty('width', '0', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
          }
        });
      }

      // 5. Remove companion/side ads
      const companionSelectors = [
        'ytd-display-ad-renderer',
        'ytd-promoted-sparkles-web-renderer',
        'ytd-ad-slot-renderer',
        'ytd-rich-ad-slot-renderer',
        'ytd-action-companion-ad-renderer',
        'ytd-companion-slot-renderer',
        'ytd-rich-grid-ad-renderer',
        'ytd-promoted-video-renderer',
        '.ytd-display-ad-renderer',
        '#player-ads',
        '.ytp-ad-companion-slot'
      ];
      for (const selector of companionSelectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.style.display !== 'none') {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
          }
        });
      }

    } catch (e) {
      console.warn('[AeroGuard] Error in YouTube ad purge:', e);
    } finally {
      isProcessing = false;
    }
  };

  // 6. MutationObserver for dynamic ad injection
  videoObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for ad-related elements
            const className = node.className || '';
            const id = node.id || '';
            if (/ad|Ad|AD/.test(className + id) && !/player|video/i.test(className + id)) {
              purgeYouTubeAds();
              break;
            }
          }
        }
      }
    }
  });

  // High-frequency execution loop (runs every 50ms for zero lag)
  const adPurgeInterval = setInterval(purgeYouTubeAds, 50);

  // Initialize observer after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      videoObserver.observe(document.documentElement, { childList: true, subtree: true });
      purgeYouTubeAds(); // Initial run
    });
  } else {
    videoObserver.observe(document.documentElement, { childList: true, subtree: true });
    purgeYouTubeAds(); // Initial run
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    clearInterval(adPurgeInterval);
    if (videoObserver) videoObserver.disconnect();
  });

  console.log('[AeroGuard] YouTube DOM blaster active');
})();