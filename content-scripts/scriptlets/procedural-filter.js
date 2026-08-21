/**
 * Feed Ad & Dynamic Sponsor Stripper
 * Inspects element text nodes dynamically to locate and erase sponsored feed posts
 * Targets social networks with randomized CSS classes (Facebook, Reddit, X/Twitter, LinkedIn, Instagram)
 * Runs in MAIN world at document_start
 */
(function () {
  'use strict';

  // ============================================
  // Configuration
  // ============================================

  // Specific phrases used by in-feed ad networks globally
  const SPONSOR_KEYWORDS = [
    'sponsored',
    'promoted',
    'advertisement',
    'paid partnership',
    'anzeige',           // German
    'publicité',         // French
    'pubblicità',        // Italian
    'publicidad',        // Spanish
    'реклама',           // Russian
    '広告',               // Japanese
    '广告',               // Chinese
    '광고',               // Korean
    'patrocinado',       // Portuguese
    'gesponsert',        // German
    'sponsorisé',        // French
    'реклама',           // Ukrainian
    'reklama',           // Polish/Czech
    'reklaam',           // Estonian
    'sponsor',           // Generic
    'advert',            // Short form
    'promo',             // Short form
    'affiliate',         // Affiliate marketing
    'brand partner',     // Brand partnerships
    'paid post',         // Paid content
    'presented by',      // Presented by
    'in partnership with', // Partnership
    'brought to you by'  // Brought to you
  ];

  // Platform-specific container selectors
  const PLATFORM_CONTAINERS = {
    // X/Twitter
    twitter: [
      'article[data-testid="tweet"]',
      'div[data-testid="tweet"]',
      'article[role="article"]',
      'div[data-testid="cellInnerDiv"]',
      '[data-testid="tweetText"]',
      'div[aria-label="Timeline: Conversation"] > div > div'
    ],
    // Facebook
    facebook: [
      '[data-pagelet^="FeedUnit_"]',
      '[data-pagelet^="FeedUnit_"] > div',
      'div[role="article"]',
      '[data-testid="post_message"]',
      '.x1yztbdb', // Common FB feed unit class pattern
      '[data-ft*="pagelet"]'
    ],
    // Reddit
    reddit: [
      '[data-testid="post-container"]',
      'div[data-click-id="body"]',
      'article[data-testid="post"]',
      'div[data-adclicklocation]',
      'shreddit-post',
      '[data-testid="post-content"]'
    ],
    // LinkedIn
    linkedin: [
      '.feed-shared-update-v2',
      '.occludable-update',
      '[data-urn*="activity"]',
      '.update-components-actor',
      '[data-test-feed-item]'
    ],
    // Instagram
    instagram: [
      'article[data-testid="post"]',
      'div[role="button"] > div > div > div',
      '[data-testid="media-container"]'
    ],
    // YouTube (Shorts, feed)
    youtube: [
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-reel-video-renderer',
      '#contents > ytd-rich-item-renderer'
    ],
    // TikTok
    tiktok: [
      '[data-e2e="feed-video"]',
      '.css-1jxhpnd-DivContainer',
      'div[data-video-id]'
    ],
    // Generic fallback
    generic: [
      'article',
      '[role="article"]',
      '[data-testid*="post"]',
      '[data-testid*="feed"]',
      '[data-testid*="item"]',
      '[data-component*="post"]',
      '[data-component*="feed"]',
      '.post', '.feed-item', '.stream-item',
      '[class*="post-"]', '[class*="feed-"]', '[class*="item-"]'
    ]
  };

  // Elements that typically contain sponsor badges
  const BADGE_SELECTORS = [
    'span', 'a', 'div', 'button', 'strong', 'b',
    '[data-testid*="sponsor"]', '[data-testid*="promoted"]',
    '[data-testid*="ad-"]', '[data-testid*="ad_"]',
    '[aria-label*="sponsor" i]', '[aria-label*="promoted" i]',
    '[class*="sponsor"]', '[class*="promoted"]', '[class*="ad-badge"]',
    '[class*="AdBadge"]', '[class*="PromotedBadge"]',
    '[class*="paid-partner"]', '[class*="brand-partner"]'
  ];

  // ============================================
  // Core Logic
  // ============================================

  let isProcessing = false;
  const processedContainers = new WeakSet();
  let observer = null;
  let scanInterval = null;

  function getAllContainers() {
    const containers = new Set();

    // Get platform-specific containers based on hostname
    const hostname = window.location.hostname.toLowerCase();
    let platformSelectors = PLATFORM_CONTAINERS.generic;

    if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      platformSelectors = PLATFORM_CONTAINERS.twitter;
    } else if (hostname.includes('facebook.com')) {
      platformSelectors = PLATFORM_CONTAINERS.facebook;
    } else if (hostname.includes('reddit.com')) {
      platformSelectors = PLATFORM_CONTAINERS.reddit;
    } else if (hostname.includes('linkedin.com')) {
      platformSelectors = PLATFORM_CONTAINERS.linkedin;
    } else if (hostname.includes('instagram.com')) {
      platformSelectors = PLATFORM_CONTAINERS.instagram;
    } else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      platformSelectors = PLATFORM_CONTAINERS.youtube;
    } else if (hostname.includes('tiktok.com')) {
      platformSelectors = PLATFORM_CONTAINERS.tiktok;
    }

    // Query all selectors
    platformSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => containers.add(el));
      } catch (e) {
        // Invalid selector, ignore
      }
    });

    return Array.from(containers);
  }

  function isSponsoredContainer(container) {
    if (!container || processedContainers.has(container)) return false;

    // Check badge elements for exact keyword matches
    const badges = container.querySelectorAll(BADGE_SELECTORS.join(', '));

    for (const badge of badges) {
      const text = badge.textContent?.trim().toLowerCase() || '';
      if (!text) continue;

      // Exact match for sponsor keywords
      for (const keyword of SPONSOR_KEYWORDS) {
        if (text === keyword ||
            text === keyword + '·' ||
            text === keyword + '•' ||
            text.startsWith(keyword + ' ') ||
            text.endsWith(' ' + keyword) ||
            text.includes(' ' + keyword + ' ')) {
          // Verify it's a badge (small element, not main content)
          const style = window.getComputedStyle(badge);
          const fontSize = parseFloat(style.fontSize) || 0;
          const isSmallBadge = fontSize <= 14 ||
                              style.fontWeight === 'bold' ||
                              style.textTransform === 'uppercase' ||
                              badge.offsetWidth < 200 ||
                              badge.offsetHeight < 30;

          if (isSmallBadge || text.length < 30) {
            return true;
          }
        }
      }
    }

    // Check for specific sponsor attribute patterns
    const sponsorAttrs = ['data-sponsored', 'data-promoted', 'data-ad', 'data-advertisement',
                          'data-paid-partnership', 'data-brand-partner'];
    for (const attr of sponsorAttrs) {
      if (container.hasAttribute(attr) || container.querySelector(`[${attr}]`)) {
        return true;
      }
    }

    // Check for specific ad component patterns
    const adPatterns = [
      'data-ad-preview', 'data-ad-context', 'data-ad-slot',
      'data-adsbygoogle', 'data-google-ad', 'data-dfp-ad'
    ];
    for (const pattern of adPatterns) {
      if (container.querySelector(`[${pattern}]`)) {
        return true;
      }
    }

    return false;
  }

  function hideSponsoredContainer(container) {
    if (processedContainers.has(container)) return false;

    try {
      // Hide with multiple strategies to ensure it stays hidden
      container.style.setProperty('display', 'none', 'important');
      container.style.setProperty('visibility', 'hidden', 'important');
      container.style.setProperty('opacity', '0', 'important');
      container.style.setProperty('height', '0', 'important');
      container.style.setProperty('width', '0', 'important');
      container.style.setProperty('overflow', 'hidden', 'important');
      container.style.setProperty('position', 'absolute', 'important');
      container.style.setProperty('left', '-9999px', 'important');
      container.style.setProperty('pointer-events', 'none', 'important');
      container.setAttribute('data-aeroguard-hidden', 'sponsored');

      processedContainers.add(container);
      console.log('[AeroGuard] Hidden sponsored feed post:', container.tagName, container.className?.substring(0, 50));
      return true;
    } catch (e) {
      console.warn('[AeroGuard] Failed to hide container:', e);
      return false;
    }
  }

  function scrubFeedAds() {
    if (isProcessing) return;
    isProcessing = true;

    try {
      const containers = getAllContainers();
      let hiddenCount = 0;

      for (const container of containers) {
        if (isSponsoredContainer(container)) {
          if (hideSponsoredContainer(container)) {
            hiddenCount++;
          }
        }
      }

      if (hiddenCount > 0) {
        console.log(`[AeroGuard] Hidden ${hiddenCount} sponsored feed posts`);
      }
    } finally {
      isProcessing = false;
    }
  }

  // ============================================
  // MutationObserver for Dynamic Feeds
  // ============================================

  function initObserver() {
    observer = new MutationObserver((mutations) => {
      if (isProcessing) return;

      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if it's a feed container or contains feed containers
              const isFeedContainer = PLATFORM_CONTAINERS.generic.some(sel => {
                try { return node.matches?.(sel); } catch { return false; }
              }) || node.querySelector?.(PLATFORM_CONTAINERS.generic.join(', '));

              if (isFeedContainer) {
                shouldScan = true;
                break;
              }
            }
          }
        }
      }

      if (shouldScan) {
        // Debounce
        clearTimeout(observer.debounceTimer);
        observer.debounceTimer = setTimeout(scrubFeedAds, 50);
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // ============================================
  // Periodic Scan for Infinite Scroll
  // ============================================

  function startPeriodicScan() {
    // Initial scan
    if (document.readyState !== 'loading') {
      scrubFeedAds();
    }

    scanInterval = setInterval(() => {
      if (!isProcessing && document.visibilityState === 'visible') {
        scrubFeedAds();
      }
    }, 3000); // Every 3 seconds
  }

  function stopPeriodicScan() {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
  }

  // ============================================
  // Visibility Change Handler
  // ============================================

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      scrubFeedAds();
    }
  }

  // ============================================
  // Initialize
  // ============================================

  function init() {
    console.log('[AeroGuard] Feed ad stripper initializing...');

    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initObserver();
        startPeriodicScan();
        document.addEventListener('visibilitychange', handleVisibilityChange);
        scrubFeedAds();
      });
    } else {
      initObserver();
      startPeriodicScan();
      document.addEventListener('visibilitychange', handleVisibilityChange);
      scrubFeedAds();
    }

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
      stopPeriodicScan();
      if (observer) observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    });

    console.log('[AeroGuard] Feed ad stripper active');
  }

  // Expose API
  window.AeroGuardFeedStripper = {
    scanNow: scrubFeedAds,
    getStats: () => ({
      processedCount: processedContainers.size,
      isProcessing,
      observerActive: !!observer,
      scanIntervalActive: !!scanInterval
    }),
    pause: () => {
      stopPeriodicScan();
      if (observer) observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    },
    resume: () => {
      initObserver();
      startPeriodicScan();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    },
    addKeyword: (keyword) => {
      if (!SPONSOR_KEYWORDS.includes(keyword.toLowerCase())) {
        SPONSOR_KEYWORDS.push(keyword.toLowerCase());
      }
    },
    addContainerSelector: (selector) => {
      PLATFORM_CONTAINERS.generic.push(selector);
    }
  };

  // Auto-initialize
  init();
})();