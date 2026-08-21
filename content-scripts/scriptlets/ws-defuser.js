/**
 * WebSocket & WebRTC Ad Stream Defuser
 * Blocks ad/telemetry/tracker WebSocket connections and WebRTC data channels
 * Runs in MAIN world at document_start
 */
(function () {
  'use strict';

  // ============================================
  // WebSocket Interception
  // ============================================

  const NativeWebSocket = window.WebSocket;

  // Regex patterns for ad-streaming WebSocket endpoints
  const blockedWsPatterns = [
    // Ad servers
    /adserver/i, /adserver\./i, /ads\./i, /ad\.ws/i, /adstream/i,
    /advertisement/i, /ad-delivery/i, /ad-delivery/i,
    /doubleclick\.net.*ws/i, /googlesyndication.*ws/i,
    /pubmatic.*ws/i, /rubicon.*ws/i, /openx.*ws/i,
    /criteo.*ws/i, /adnxs.*ws/i, /smartadserver.*ws/i,
    /adsrvr.*ws/i, /teads.*ws/i, /indexexchange.*ws/i,
    /sovrn.*ws/i, /sonobi.*ws/i, /districtm.*ws/i,
    /yieldlab.*ws/i, /yieldmo.*ws/i, /appnexus.*ws/i,

    // Telemetry & tracking
    /telemetry/i, /tracker/i, /analytics.*ws/i, /metrics.*ws/i,
    /beacon.*ws/i, /collect.*ws/i, /event.*ws/i, /log.*ws/i,
    /stats.*ws/i, /measure.*ws/i, /monitor.*ws/i,
    /rum.*ws/i, /performance.*ws/i, /heartbeat.*ws/i,
    /ping.*ws/i, /health.*ws/i, /report.*ws/i,

    // Specific tracking platforms
    /segment\.com.*ws/i, /mixpanel.*ws/i, /amplitude.*ws/i,
    /heap.*ws/i, /fullstory.*ws/i, /hotjar.*ws/i,
    /mouseflow.*ws/i, /luckyorange.*ws/i, /crazyegg.*ws/i,
    /optimizely.*ws/i, /vwo.*ws/i, /abtasty.*ws/i,
    /kissmetrics.*ws/i, /intercom.*ws/i, /drift.*ws/i,
    /zendesk.*ws/i, /freshchat.*ws/i, /tawk.*ws/i,
    /crisp.*ws/i, /smartsupp.*ws/i, /tidio.*ws/i,

    // Popunder / malicious
    /popunder/i, /pop-up/i, /popup.*ws/i, /redirect.*ws/i,
    /affiliate.*ws/i, /click.*ws/i, /traffic.*ws/i,

    // Crypto miners
    /coinhive/i, /cryptoloot/i, /jsecoin/i, /miner.*ws/i,
    /stratum.*ws/i, /xmr.*ws/i, /monero.*ws/i,

    // Video ad streaming
    /videoplaza.*ws/i, /spotx.*ws/i, /freewheel.*ws/i,
    /brightcove.*ws/i, /theplatform.*ws/i, /ooyala.*ws/i,
    /jwplayer.*ws/i, /vast.*ws/i, /vpaid.*ws/i,

    // Social widgets streaming
    /facebook.*ws/i, /fbcdn.*ws/i, /instagram.*ws/i,
    /twitter.*ws/i, /t\.co.*ws/i, /linkedin.*ws/i,
    /pinterest.*ws/i, /snapchat.*ws/i, /tiktok.*ws/i
  ];

  // Whitelist patterns (legitimate WebSockets)
  const whitelistedWsPatterns = [
    /^wss?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i,
    /\.hot-update\.json$/i, // Webpack HMR
    /__webpack_hmr/i,
    /livereload/i,
    /browser-sync/i,
    /\.github\.com.*ws/i,
    /\.gitlab\.com.*ws/i,
    /\.bitbucket\.org.*ws/i,
    /\.visualstudio\.com.*ws/i,
    /\.azure\.com.*ws/i,
    /\.atlassian\.com.*ws/i,
    /\.slack\.com.*ws/i,
    /\.discord\.com.*ws/i,
    /\.zoom\.us.*ws/i,
    /\.webex\.com.*ws/i,
    /\.teams\.microsoft\.com.*ws/i,
    /\.meet\.google\.com.*ws/i,
    /\.skype\.com.*ws/i
  ];

  const isBlocked = (url) => {
    const urlString = String(url).toLowerCase();
    // Check whitelist first
    if (whitelistedWsPatterns.some(pattern => pattern.test(urlString))) {
      return false;
    }
    return blockedWsPatterns.some(pattern => pattern.test(urlString));
  };

  // Create a dummy closed WebSocket
  function createDummyWebSocket(url) {
    const dummy = {
      readyState: WebSocket.CLOSED,
      url: String(url),
      protocol: '',
      extensions: '',
      bufferedAmount: 0,
      binaryType: 'blob',
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      close: function () { this.readyState = WebSocket.CLOSED; if (this.onclose) this.onclose({ code: 1000, reason: 'Blocked by AeroGuard', wasClean: true }); },
      send: function () { console.warn('[AeroGuard] Attempted send on blocked WebSocket:', url); },
      addEventListener: function () {},
      removeEventListener: function () {},
      dispatchEvent: function () { return true; },
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3
    };
    // Trigger onerror and onclose asynchronously
    setTimeout(() => {
      if (dummy.onerror) dummy.onerror(new Event('error'));
      if (dummy.onclose) dummy.onclose({ code: 1006, reason: 'Blocked by AeroGuard', wasClean: false });
    }, 0);
    return dummy;
  }

  // Override WebSocket constructor
  window.WebSocket = function (url, protocols) {
    const urlString = String(url);

    if (isBlocked(urlString)) {
      console.warn('[AeroGuard] Blocked WebSocket connection:', urlString);
      return createDummyWebSocket(urlString);
    }

    try {
      const ws = protocols ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
      return ws;
    } catch (e) {
      console.warn('[AeroGuard] WebSocket construction failed:', e);
      return createDummyWebSocket(urlString);
    }
  };

  // Preserve prototype chain
  window.WebSocket.prototype = NativeWebSocket.prototype;
  window.WebSocket.CONNECTING = NativeWebSocket.CONNECTING;
  window.WebSocket.OPEN = NativeWebSocket.OPEN;
  window.WebSocket.CLOSING = NativeWebSocket.CLOSING;
  window.WebSocket.CLOSED = NativeWebSocket.CLOSED;

  // ============================================
  // WebRTC Data Channel Interception
  // ============================================

  if (window.RTCPeerConnection) {
    const NativeRTCPeerConnection = window.RTCPeerConnection;
    const NativeCreateDataChannel = NativeRTCPeerConnection.prototype.createDataChannel;

    NativeRTCPeerConnection.prototype.createDataChannel = function (label, options) {
      // Check if this is likely an ad/data tracking channel
      const labelLower = String(label).toLowerCase();
      if (/ad|track|metric|telemetry|analytics|beacon|pixel|stats|monitor/.test(labelLower)) {
        console.warn('[AeroGuard] Blocked WebRTC data channel creation:', label);

        // Return a dummy data channel
        const dummyChannel = {
          label: label,
          ordered: options?.ordered ?? true,
          maxPacketLifeTime: options?.maxPacketLifeTime,
          maxRetransmits: options?.maxRetransmits,
          protocol: options?.protocol ?? '',
          negotiated: options?.negotiated ?? false,
          id: options?.id,
          readyState: 'closed',
          bufferedAmount: 0,
          bufferedAmountLowThreshold: 0,
          onopen: null,
          onclose: null,
          onerror: null,
          onmessage: null,
          binaryType: 'blob',
          close: function () { this.readyState = 'closed'; if (this.onclose) this.onclose(new Event('close')); },
          send: function () { console.warn('[AeroGuard] Attempted send on blocked data channel:', label); },
          addEventListener: function () {},
          removeEventListener: function () {},
          dispatchEvent: function () { return true; }
        };
        setTimeout(() => {
          if (dummyChannel.onerror) dummyChannel.onerror(new Event('error'));
          if (dummyChannel.onclose) dummyChannel.onclose(new Event('close'));
        }, 0);
        return dummyChannel;
      }
      return NativeCreateDataChannel.call(this, label, options);
    };
  }

  // ============================================
  // Server-Sent Events (EventSource) Interception
  // ============================================

  if (window.EventSource) {
    const NativeEventSource = window.EventSource;

    window.EventSource = function (url, options) {
      const urlString = String(url);
      if (isBlocked(urlString)) {
        console.warn('[AeroGuard] Blocked EventSource connection:', urlString);
        // Return a dummy EventSource that immediately closes
        const dummy = {
          url: urlString,
          readyState: EventSource.CLOSED,
          withCredentials: options?.withCredentials ?? false,
          onopen: null,
          onmessage: null,
          onerror: null,
          close: function () { this.readyState = EventSource.CLOSED; },
          addEventListener: function () {},
          removeEventListener: function () {},
          dispatchEvent: function () { return true; },
          CONNECTING: 0,
          OPEN: 1,
          CLOSED: 2
        };
        setTimeout(() => {
          if (dummy.onerror) dummy.onerror(new Event('error'));
        }, 0);
        return dummy;
      }
      return new NativeEventSource(url, options);
    };

    window.EventSource.prototype = NativeEventSource.prototype;
    window.EventSource.CONNECTING = NativeEventSource.CONNECTING;
    window.EventSource.OPEN = NativeEventSource.OPEN;
    window.EventSource.CLOSED = NativeEventSource.CLOSED;
  }

  // ============================================
  // Fetch/XHR Interception for WebSocket Upgrade Requests
  // ============================================

  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const urlString = String(url).toLowerCase();

    // Check for WebSocket upgrade requests
    if (init?.headers) {
      const headers = new Headers(init.headers);
      const upgrade = headers.get('upgrade');
      const connection = headers.get('connection');
      if (upgrade && upgrade.toLowerCase() === 'websocket' &&
          connection && connection.toLowerCase().includes('upgrade')) {
        if (isBlocked(urlString)) {
          console.warn('[AeroGuard] Blocked WebSocket upgrade request:', urlString);
          throw new DOMException('WebSocket connection blocked by AeroGuard', 'SecurityError');
        }
      }
    }

    return originalFetch.apply(this, arguments);
  };

  // Monitor for dynamic script injection that might create WebSockets
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SCRIPT') {
          const src = node.src || '';
          if (src && isBlocked(src)) {
            console.warn('[AeroGuard] Blocked script that may open WebSocket:', src);
            node.remove();
          }
        }
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  } else {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  console.log('[AeroGuard] WebSocket & WebRTC ad stream defuser active');
})();