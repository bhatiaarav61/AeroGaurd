// content/element-hider.js — Element hider (cosmetic filtering at document_start)
(() => {
  'use strict';

  const AD_SELECTORS = [
    '.ad', '.ads', '.advert', '.advertisement', '.advertising', '.banner-ad', '.banner_ad',
    '.bannerAd', '.sidebar-ad', '.sidebar_ad', '.sidebarAd', '.header-ad', '.header_ad',
    '.headerAd', '.footer-ad', '.footer_ad', '.footerAd', '.leaderboard-ad', '.leaderboard_ad',
    '.leaderboardAd', '.skyscraper-ad', '.skyscraper_ad', '.skyscraperAd', '.rectangle-ad',
    '.rectangle_ad', '.rectangleAd', '.popup-ad', '.popup_ad', '.popupAd', '.interstitial-ad',
    '.interstitial_ad', '.interstitialAd', '.native-ad', '.native_ad', '.nativeAd',
    '.instream-ad', '.instream_ad', '.instreamAd', '.outstream-ad', '.outstream_ad',
    '.outstreamAd', '.video-ad', '.video_ad', '.videoAd', '.audio-ad', '.audio_ad',
    '.audioAd', '.display-ad', '.display_ad', '.displayAd', '.text-ad', '.text_ad',
    '.textAd', '.image-ad', '.image_ad', '.imageAd', '.richmedia-ad', '.richmedia_ad',
    '.richmediaAd', '.expandable-ad', '.expandable_ad', '.expandableAd', '.floating-ad',
    '.floating_ad', '.floatingAd', '.sticky-ad', '.sticky_ad', '.stickyAd',
    '.anchor-ad', '.anchor_ad', '.anchorAd',

    // Google AdSense
    '.adsbygoogle', '.adsbygoogle-noablate', '#google_ads_iframe_', 'ins.adsbygoogle',
    '.ad-slot', '.adslot',

    // Ad networks
    '[class*="dfp-"]', '[id*="dfp-"]', '[class*="gpt-"]', '[id*="gpt-"]',
    '[class*="admanager"]', '[id*="admanager"]', '[class*="adserver"]', '[id*="adserver"]',
    '[class*="adtech"]', '[id*="adtech"]', '[class*="doubleclick"]', '[id*="doubleclick"]',
    '[class*="googlesyndication"]', '[id*="googlesyndication"]', '[class*="googleadservices"]', '[id*="googleadservices"]',
    '[class*="googletagmanager"]', '[id*="googletagmanager"]', '[class*="googletagservices"]', '[id*="googletagservices"]',
    '[class*="pubads"]', '[id*="pubads"]', '[class*="pagead"]', '[id*="pagead"]',

    // Taboola/Outbrain
    '[class*="taboola"]', '[id*="taboola"]', '[class*="outbrain"]', '[id*="outbrain"]',
    '.trc_rbox_div', '.trc_rbox_container', '#outbrain_widget_', '.ob_widget', '.ob_container',

    // Other networks
    '[class*="criteo"]', '[id*="criteo"]', '[class*="rubicon"]', '[id*="rubicon"]',
    '[class*="openx"]', '[id*="openx"]', '[class*="appnexus"]', '[id*="appnexus"]',
    '[class*="indexexchange"]', '[id*="indexexchange"]', '[class*="pubmatic"]', '[id*="pubmatic"]',
    '[class*="smaato"]', '[id*="smaato"]', '[class*="moat"]', '[id*="moat"]',
    '[class*="integral"]', '[id*="integral"]', '[class*="doubleverify"]', '[id*="doubleverify"]',
    '[class*="ias"]', '[id*="ias"]', '[class*="measure"]', '[id*="measure"]',
    '[class*="tracking"]', '[id*="tracking"]', '[class*="analytics"]', '[id*="analytics"]',

    // Iframe ads
    'iframe[src*="doubleclick.net"]', 'iframe[src*="googlesyndication.com"]', 'iframe[src*="googleadservices.com"]',
    'iframe[src*="googletagmanager.com"]', 'iframe[src*="googletagservices.com"]',
    'iframe[src*="pubads.g.doubleclick.net"]', 'iframe[src*="pagead2.googlesyndication.com"]',
    'iframe[src*="adservice.google"]', 'iframe[src*="imasdk"]', 'iframe[src*="taboola.com"]',
    'iframe[src*="outbrain.com"]', 'iframe[src*="criteo.com"]', 'iframe[src*="rubiconproject.com"]',
    'iframe[src*="openx.net"]', 'iframe[src*="appnexus.com"]', 'iframe[src*="indexexchange.com"]',
    'iframe[src*="pubmatic.com"]', 'iframe[src*="smaato.net"]', 'iframe[src*="moatads.com"]',
    'iframe[src*="adnxs.com"]', 'iframe[src*="adform.net"]', 'iframe[src*="adtech.de"]',
    'iframe[src*="advertising.com"]', 'iframe[src*="amazon-adsystem.com"]',
    'iframe[src*="amazonaws.com/ads"]', 'iframe[src*="casalemedia.com"]',

    // Specific IDs
    '#ad-banner', '#ad-sidebar', '#ad-header', '#ad-footer', '#ad-leaderboard',
    '#ad-skyscraper', '#ad-rectangle', '#ad-popup', '#ad-interstitial',
    '#ad-native', '#ad-instream', '#ad-outstream', '#ad-video', '#ad-audio',
    '#ad-display', '#ad-text', '#ad-image', '#ad-richmedia', '.ad-zone', '.ad-space', '.ad-box', '#ad-slot', '#banner-ad'
  ];

  // Inject CSS immediately at document_start
  const style = document.createElement('style');
  style.id = 'aeroguard-element-hider';
  style.textContent = AD_SELECTORS.map(sel => `${sel} { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; height: 0 !important; width: 0 !important; overflow: hidden !important; position: absolute !important; z-index: -9999 !important; }`).join('\n');
  (document.head || document.documentElement).appendChild(style);

  // MutationObserver for dynamically added elements
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            // Check if the added node matches any ad selector
            for (const selector of ['.ad', '.ads', '.advert', '.advertisement', '.ad-banner', '#ad-', '[class*="ad-"]', '[id*="ad-"]', '.adsbygoogle', '[class*="dfp-"]', '[class*="gpt-"]']) {
              try {
                if (node.matches && node.matches('.ad, .ads, .advert, .advertisement, .ad-banner, #ad-, [class*="ad-"], [id*="ad-"], .adsbygoogle, [class*="dfp-"], [class*="gpt-"]')) {
                  node.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-9999!important';
                  node._adBlocked = true;
                  break;
                }
              } catch (e) {}
            }
            // Check children
            if (node.querySelector) {
              const adElements = node.querySelectorAll('.ad, .ads, .advert, .advertisement, .ad-banner, #ad-, [class*="ad-"], [id*="ad-"], .adsbygoogle, [class*="dfp-"], [class*="gpt-"]');
              adElements.forEach(el => {
                el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-9999!important';
                el._adBlocked = true;
              });
            }
          }
        }
      });
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Also handle dynamically added iframes with ad sources
    const iframeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && node.tagName === 'IFRAME') {
            const src = node.src || '';
            if (src.includes('doubleclick.net') || src.includes('googlesyndication.com') ||
                src.includes('googleadservices.com') || src.includes('googlesyndication.com') ||
                src.includes('googletagmanager.com') || src.includes('googletagservices.com') ||
                src.includes('pubads.g.doubleclick.net') || src.includes('pagead2.googlesyndication.com') ||
                src.includes('adservice.google') || src.includes('imasdk') || src.includes('taboola.com') ||
                src.includes('outbrain.com') || src.includes('criteo.com') || src.includes('rubiconproject.com') ||
                src.includes('openx.net') || src.includes('appnexus.com') || src.includes('indexexchange.com') ||
                src.includes('pubmatic.com') || src.includes('smaato.net') || src.includes('moatads.com') ||
                src.includes('adnxs.com') || src.includes('adform.net') || src.includes('adtech.de') ||
                src.includes('advertising.com') || src.includes('amazon-adsystem.com')) {
              node.remove();
            }
          }
        }
      });
    });

    iframeObserver.observe(document.documentElement, { childList: true, subtree: true });

    // Initial pass for already-loaded elements
    document.addEventListener('DOMContentLoaded', () => {
      const adSelectors = [
        '.ad', '.ads', '.advert', '.advertisement', '.ad-banner', '#ad-',
        '[class*="ad-"]', '[id*="ad-"]', '.adsbygoogle',
        '[class*="dfp-"]', '[class*="gpt-"]', '[class*="admanager"]',
        '[class*="adserver"]', '[class*="adtech"]', '[class*="doubleclick"]',
        '[class*="googlesyndication"]', '[class*="googleadservices"]',
        '[class*="googletagmanager"]', '[class*="googletagservices"]',
        '[class*="pubads"]', '[class*="pagead"]', '[class*="taboola"]',
        '[class*="outbrain"]', '[class*="criteo"]', '[class*="rubicon"]',
        '[class*="openx"]', '[class*="appnexus"]', '[class*="indexexchange"]',
        '[class*="pubmatic"]', '[class*="smaato"]', '[class*="moat"]',
        '[class*="integral"]', '[class*="doubleverify"]', '[class*="ias"]',
        '[class*="measure"]', '[class*="tracking"]', '[class*="analytics"]'
      ];

      const style = document.createElement('style');
      style.id = 'aeroguard-element-hider';
      style.textContent = [
        '.ad, .ads, .advert, .advertisement, .ad-banner, #ad-, [class*="ad-"], [id*="ad-"], .adsbygoogle,',
        '[class*="dfp-"], [class*="gpt-"], [class*="admanager"], [class*="adserver"],',
        '[class*="adtech"], [class*="doubleclick"], [class*="googlesyndication"],',
        '[class*="googleadservices"], [class*="googletagmanager"], [class*="googletagservices"],',
        '[class*="pubads"], [class*="pagead"], [class*="taboola"], [class*="outbrain"],',
        '[class*="criteo"], [class*="rubicon"], [class*="openx"], [class*="appnexus"],',
        '[class*="indexexchange"], [class*="pubmatic"], [class*="smaato"], [class*="moat"],',
        '[class*="integral"], [class*="doubleverify"], [class*="ias"], [class*="measure"],',
        '[class*="tracking"], [class*="analytics"],',
        '#ad-banner, #ad-sidebar, #ad-header, #ad-footer, #ad-leaderboard,',
        '#ad-skyscraper, #ad-rectangle, #ad-popup, #ad-interstitial,',
        '#ad-native, #ad-instream, #ad-outstream, #ad-video, #ad-audio,',
        '#ad-display, #ad-text, #ad-image, #ad-richmedia, .ad-zone, .ad-space, .ad-box, #ad-slot, #banner-ad,',
        'iframe[src*="doubleclick.net"], iframe[src*="googlesyndication.com"],',
        'iframe[src*="googleadservices.com"], iframe[src*="googletagmanager.com"],',
        'iframe[src*="googletagservices.com"], iframe[src*="pubads.g.doubleclick.net"],',
        'iframe[src*="pagead2.googlesyndication.com"], iframe[src*="adservice.google"],',
        'iframe[src*="imasdk"], iframe[src*="taboola.com"], iframe[src*="outbrain.com"],',
        'iframe[src*="criteo.com"], iframe[src*="rubiconproject.com"],',
        'iframe[src*="openx.net"], iframe[src*="appnexus.com"], iframe[src*="indexexchange.com"],',
        'iframe[src*="pubmatic.com"], iframe[src*="smaato.net"], iframe[src*="moatads.com"],',
        'iframe[src*="adnxs.com"], iframe[src*="adform.net"], iframe[src*="adtech.de"],',
        'iframe[src*="advertising.com"], iframe[src*="amazon-adsystem.com"],',
        'iframe[src*="amazonaws.com/ads"], iframe[src*="casalemedia.com"],',
        'iframe[src*="contextweb.com"], iframe[src*="crwdcntrl.net"], iframe[src*="demdex.net"],',
        'iframe[src*="everesttech.net"], iframe[src*="exelator.com"], iframe[src*="eyeviewads.com"],',
        'iframe[src*="flashtalking.com"], iframe[src*="freewheel.com"],',
        'iframe[src*="googleads.g.doubleclick.net"], iframe[src*="ib.adnxs.com"],',
        'iframe[src*="idsync.rlcdn.com"], iframe[src*="imrworldwide.com"],',
        'iframe[src*="intentiq.com"], iframe[src*="inner-active.com"], iframe[src*="innity.net"],',
        'iframe[src*="ipredictive.com"], iframe[src*="krxd.net"], iframe[src*="lijit.com"],',
        'iframe[src*="linksynergy.com"], iframe[src*="mathtag.com"], iframe[src*="media.net"],',
        'iframe[src*="media6degrees.com"], iframe[src*="mediamath.com"],',
        'iframe[src*="moatads.com"], iframe[src*="mookie1.com"], iframe[src*="nexac.com"],',
        'iframe[src*="openx.net"], iframe[src*="optimizely.com"], iframe[src*="outbrain.com"],',
        'iframe[src*="owneriq.net"], iframe[src*="parsely.com"], iframe[src*="pixel.ad"],',
        'iframe[src*="pixel.parsely.com"], iframe[src*="quantserve.com"], iframe[src*="r.msn.com"],',
        'iframe[src*="rbidr.io"], iframe[src*="rlcdn.com"], iframe[src*="rubiconproject.com"],',
        'iframe[src*="scorecardresearch.com"], iframe[src*="segment.io"],',
        'iframe[src*="serving-sys.com"], iframe[src*="sharethrough.com"],',
        'iframe[src*="simpli.fi"], iframe[src*="smaato.net"], iframe[src*="sonobi.com"],',
        'iframe[src*="specificmedia.com"], iframe[src*="spotxchange.com"],',
        'iframe[src*="stickyadstv.com"], iframe[src*="taboola.com"], iframe[src*="tapad.com"],',
        'iframe[src*="teads.tv"], iframe[src*="thebrighttag.com"], iframe[src*="tidaltv.com"],',
        'iframe[src*="tribalfusion.com"], iframe[src*="turn.com"], iframe[src*="tynt.com"],',
        'iframe[src*="visualdna.com"], iframe[src*="w55c.net"], iframe[src*="webtrends.com"],',
        'iframe[src*="widiun.com"], iframe[src*="wishabi.com"], iframe[src*="xiti.com"],',
        'iframe[src*="yieldlab.net"], iframe[src*="yieldmanager.com"],',
        'iframe[src*="yieldmo.com"], iframe[src*="zedo.com"]'
      ].join(' ') + ' { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; height: 0 !important; width: 0 !important; overflow: hidden !important; position: absolute !important; z-index: -9999 !important; }';

      document.head.appendChild(style);
    });
  }
})();