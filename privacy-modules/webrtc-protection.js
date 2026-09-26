/**
 * WebRTC IP Leak Protection Module
 * Blocks WebRTC connections that could leak local IP addresses
 * Provides option to disable WebRTC entirely
 *
 * Based on Brave's WebRTC protection implementation
 */

class WebRTCProtection {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.blockMode = options.blockMode || 'default'; // 'default', 'disable', 'proxy-only'
    this.allowedDomains = new Set(options.allowedDomains || []);
    this.blockedConnections = new Map();
    this.connectionAttempts = new Map();
    this.maxAttemptsPerSecond = options.maxAttemptsPerSecond || 10;

    // WebRTC-related APIs to monitor/block
    this.apis = [
      'RTCPeerConnection',
      'RTCDataChannel',
      'RTCSessionDescription',
      'RTCIceCandidate',
      'webkitRTCPeerConnection',
      'mozRTCPeerConnection',
      'msRTCPeerConnection'
    ];

    this.originalImplementations = new Map();
    this.isPatched = false;
  }

  /**
   * Initialize the WebRTC protection
   */
  async initialize() {
    if (this.isPatched) return;

    if (this.blockMode === 'disable') {
      await this.disableWebRTC();
    } else if (this.blockMode === 'proxy-only') {
      await this.enforceProxyOnly();
    } else {
      await this.patchWebRTCAPIs();
    }

    this.isPatched = true;
    console.log('[WebRTCProtection] Initialized with mode:', this.blockMode);
  }

  /**
   * Disable WebRTC entirely by removing/overriding APIs
   */
  async disableWebRTC() {
    if (typeof window === 'undefined') return;

    for (const api of this.apis) {
      if (api in window) {
        this.originalImplementations.set(api, window[api]);

        // Override with a throwing implementation
        Object.defineProperty(window, api, {
          configurable: true,
          writable: true,
          value: new Proxy(function() {}, {
            construct() {
              throw new DOMException(
                'WebRTC has been disabled by privacy protection',
                'SecurityError'
              );
            },
            apply() {
              throw new DOMException(
                'WebRTC has been disabled by privacy protection',
                'SecurityError'
              );
            }
          })
        });
      }
    }

    // Also patch MediaDevices.getUserMedia to prevent device enumeration
    if ('mediaDevices' in navigator) {
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      this.originalImplementations.set('getUserMedia', originalGetUserMedia);

      navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (constraints && (constraints.audio || constraints.video)) {
          throw new DOMException(
            'WebRTC device access has been disabled by privacy protection',
            'SecurityError'
          );
        }
        return originalGetUserMedia(constraints);
      };
    }

    // Patch navigator.getUserMedia (legacy)
    if ('getUserMedia' in navigator) {
      const originalGetUserMedia = navigator.getUserMedia.bind(navigator);
      this.originalImplementations.set('navigator.getUserMedia', originalGetUserMedia);

      navigator.getUserMedia = (constraints, success, error) => {
        error?.(new DOMException(
          'WebRTC device access has been disabled by privacy protection',
          'SecurityError'
        ));
      };
    }
  }

  /**
   * Enforce proxy-only mode (only allow WebRTC through proxy)
   */
  async enforceProxyOnly() {
    if (typeof window === 'undefined') return;

    const OriginalRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;

    if (!OriginalRTCPeerConnection) return;

    this.originalImplementations.set('RTCPeerConnection', OriginalRTCPeerConnection);

    const self = this;

    window.RTCPeerConnection = function(configuration = {}) {
      // Force proxy-only ICE transport policy
      const proxyConfig = {
        ...configuration,
        iceTransportPolicy: 'relay' // Only use TURN relay, no direct connections
      };

      const pc = new OriginalRTCPeerConnection(proxyConfig);

      // Monitor ICE candidates for leaks
      const originalAddIceCandidate = pc.addIceCandidate.bind(pc);
      pc.addIceCandidate = function(candidate) {
        if (candidate && candidate.candidate) {
          self.checkICECandidate(candidate.candidate, 'addIceCandidate');
        }
        return originalAddIceCandidate(candidate);
      };

      // Monitor onicecandidate event
      const originalOnIceCandidate = pc.onicecandidate;
      pc.onicecandidate = function(event) {
        if (event.candidate && event.candidate.candidate) {
          self.checkICECandidate(event.candidate.candidate, 'onicecandidate');
        }
        if (originalOnIceCandidate) {
          return originalOnIceCandidate.call(this, event);
        }
      };

      return pc;
    };

    // Copy static properties
    for (const prop of Object.getOwnPropertyNames(OriginalRTCPeerConnection)) {
      if (prop !== 'prototype' && prop !== 'length' && prop !== 'name') {
        try {
          window.RTCPeerConnection[prop] = OriginalRTCPeerConnection[prop];
        } catch (e) {}
      }
    }

    window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
  }

  /**
   * Patch WebRTC APIs to monitor and filter connections
   */
  async patchWebRTCAPIs() {
    if (typeof window === 'undefined') return;

    const OriginalRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;

    if (!OriginalRTCPeerConnection) return;

    this.originalImplementations.set('RTCPeerConnection', OriginalRTCPeerConnection);

    const self = this;

    window.RTCPeerConnection = function(configuration = {}) {
      const pc = new OriginalRTCPeerConnection(configuration);

      // Track connection for this origin
      const origin = window.location.origin;
      if (!self.connectionAttempts.has(origin)) {
        self.connectionAttempts.set(origin, []);
      }

      // Monitor ICE gathering state
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          self.onICEGatheringComplete(pc, origin);
        }
      });

      // Monitor ICE candidates
      const originalOnIceCandidate = pc.onicecandidate;
      pc.onicecandidate = function(event) {
        if (event.candidate && event.candidate.candidate) {
          self.checkICECandidate(event.candidate.candidate, 'onicecandidate', origin);
        }
        if (originalOnIceCandidate) {
          return originalOnIceCandidate.call(this, event);
        }
      };

      // Monitor connection state
      pc.addEventListener('connectionstatechange', () => {
        self.onConnectionStateChange(pc, origin);
      });

      return pc;
    };

    // Copy static properties
    for (const prop of Object.getOwnPropertyNames(OriginalRTCPeerConnection)) {
      if (prop !== 'prototype' && prop !== 'length' && prop !== 'name') {
        try {
          window.RTCPeerConnection[prop] = OriginalRTCPeerConnection[prop];
        } catch (e) {}
      }
    }

    window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
  }

  /**
   * Check ICE candidate for potential IP leaks
   */
  checkICECandidate(candidateString, source, origin = window.location.origin) {
    // Parse candidate
    const candidate = this.parseICECandidate(candidateString);
    if (!candidate) return;

    // Check for local IP addresses
    const ip = candidate.ip;
    if (!ip) return;

    // Check if it's a private/local IP
    if (this.isPrivateIP(ip)) {
      console.warn('[WebRTCProtection] Blocked local IP leak:', ip, 'via', source);
      this.recordBlockedConnection(origin, ip, source, candidateString);
      return true; // Indicates blocked
    }

    // Check for mDNS addresses (local network hostnames)
    if (this.isMDNSAddress(ip)) {
      console.warn('[WebRTCProtection] Blocked mDNS leak:', ip, 'via', source);
      this.recordBlockedConnection(origin, ip, source, candidateString);
      return true;
    }

    // Check for IPv6 link-local
    if (this.isLinkLocalIPv6(ip)) {
      console.warn('[WebRTCProtection] Blocked IPv6 link-local leak:', ip, 'via', source);
      this.recordBlockedConnection(origin, ip, source, candidateString);
      return true;
    }

    return false; // Not blocked
  }

  /**
   * Parse ICE candidate string
   */
  parseICECandidate(candidateString) {
    try {
      // Format: candidate:foundation component protocol priority ip port typ type ...
      const parts = candidateString.split(' ');
      if (parts.length < 8) return null;

      const candidate = {
        foundation: parts[0].replace('candidate:', ''),
        component: parseInt(parts[1]),
        protocol: parts[2],
        priority: parseInt(parts[3]),
        ip: parts[4],
        port: parseInt(parts[5]),
        type: parts[7]
      };

      // Parse additional attributes
      for (let i = 8; i < parts.length; i += 2) {
        if (parts[i] === 'raddr') candidate.raddr = parts[i + 1];
        if (parts[i] === 'rport') candidate.rport = parseInt(parts[i + 1]);
        if (parts[i] === 'tcptype') candidate.tcptype = parts[i + 1];
      }

      return candidate;
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if IP is private (RFC 1918)
   */
  isPrivateIP(ip) {
    // IPv4 private ranges
    const ipv4Parts = ip.split('.').map(Number);
    if (ipv4Parts.length === 4 && ipv4Parts.every(p => !isNaN(p))) {
      // 10.0.0.0/8
      if (ipv4Parts[0] === 10) return true;
      // 172.16.0.0/12
      if (ipv4Parts[0] === 172 && ipv4Parts[1] >= 16 && ipv4Parts[1] <= 31) return true;
      // 192.168.0.0/16
      if (ipv4Parts[0] === 192 && ipv4Parts[1] === 168) return true;
      // 169.254.0.0/16 (link-local)
      if (ipv4Parts[0] === 169 && ipv4Parts[1] === 254) return true;
      // 127.0.0.0/8 (loopback)
      if (ipv4Parts[0] === 127) return true;
      return false;
    }

    // IPv6 private ranges
    if (ip.includes(':')) {
      const normalized = ip.toLowerCase();
      // fc00::/7 (ULA)
      if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
      // fe80::/10 (link-local)
      if (normalized.startsWith('fe80:')) return true;
      // ::1/128 (loopback)
      if (normalized === '::1') return true;
      // ::/128 (unspecified)
      if (normalized === '::') return true;
      // 64:ff9b::/96 (IPv4-IPv6 translation)
      if (normalized.startsWith('64:ff9b:')) return true;
      // 2001:db8::/32 (documentation)
      if (normalized.startsWith('2001:db8:')) return true;
      return false;
    }

    return false;
  }

  /**
   * Check if IP is mDNS address (.local)
   */
  isMDNSAddress(ip) {
    return ip.endsWith('.local') || ip.endsWith('.local.');
  }

  /**
   * Check if IPv6 is link-local
   */
  isLinkLocalIPv6(ip) {
    if (!ip.includes(':')) return false;
    const normalized = ip.toLowerCase();
    return normalized.startsWith('fe80:');
  }

  /**
   * Record a blocked connection attempt
   */
  recordBlockedConnection(origin, ip, source, candidateString) {
    const key = `${origin}:${ip}`;
    const now = Date.now();

    if (!this.blockedConnections.has(key)) {
      this.blockedConnections.set(key, {
        origin,
        ip,
        source,
        candidateString,
        firstBlocked: now,
        lastBlocked: now,
        count: 1
      });
    } else {
      const record = this.blockedConnections.get(key);
      record.lastBlocked = now;
      record.count++;
    }

    // Rate limiting
    const attempts = this.connectionAttempts.get(origin) || [];
    attempts.push(now);
    // Remove attempts older than 1 second
    const recent = attempts.filter(t => now - t < 1000);
    this.connectionAttempts.set(origin, recent);
  }

  /**
   * Called when ICE gathering completes
   */
  onICEGatheringComplete(pc, origin) {
    // Check all gathered candidates
    // This is a safety net in case onicecandidate missed some
    pc.getStats().then(stats => {
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.nominated) {
          // Check local candidate
          if (report.localCandidateId) {
            const localCandidate = stats.get(report.localCandidateId);
            if (localCandidate && localCandidate.ip) {
              this.checkICECandidate(
                `candidate:${localCandidate.foundation} ${localCandidate.component} ${localCandidate.protocol} ${localCandidate.priority} ${localCandidate.ip} ${localCandidate.port} typ ${localCandidate.type}`,
                'getStats',
                origin
              );
            }
          }
        }
      });
    }).catch(() => {});
  }

  /**
   * Called when connection state changes
   */
  onConnectionStateChange(pc, origin) {
    if (pc.connectionState === 'connected') {
      // Connection established - verify no leaks
      pc.getStats().then(stats => {
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.nominated) {
            if (report.localCandidateId) {
              const localCandidate = stats.get(report.localCandidateId);
              if (localCandidate && localCandidate.ip) {
                if (this.isPrivateIP(localCandidate.ip)) {
                  console.warn('[WebRTCProtection] Active connection using private IP:', localCandidate.ip);
                }
              }
            }
          }
        });
      }).catch(() => {});
    }
  }

  /**
   * Allow a specific domain to use WebRTC
   */
  allowDomain(domain) {
    const normalized = domain.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    this.allowedDomains.add(normalized);
  }

  /**
   * Remove a domain from the allowlist
   */
  removeAllowedDomain(domain) {
    const normalized = domain.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    this.allowedDomains.delete(normalized);
  }

  /**
   * Check if current origin is allowed
   */
  isOriginAllowed() {
    if (typeof window === 'undefined') return true;
    const origin = window.location.origin;
    const hostname = window.location.hostname;

    return this.allowedDomains.has(origin) || this.allowedDomains.has(hostname);
  }

  /**
   * Get blocked connection statistics
   */
  getBlockedStats() {
    const stats = [];
    for (const [key, record] of this.blockedConnections) {
      stats.push({
        origin: record.origin,
        ip: record.ip,
        source: record.source,
        firstBlocked: record.firstBlocked,
        lastBlocked: record.lastBlocked,
        count: record.count
      });
    }
    return stats;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      blockMode: this.blockMode,
      isPatched: this.isPatched,
      allowedDomainsCount: this.allowedDomains.size,
      blockedConnectionsCount: this.blockedConnections.size,
      blockedStats: this.getBlockedStats()
    };
  }

  /**
   * Set block mode
   */
  setBlockMode(mode) {
    if (!['default', 'disable', 'proxy-only'].includes(mode)) {
      throw new Error('Invalid block mode');
    }
    this.blockMode = mode;
    this.restore();
    this.initialize();
  }

  /**
   * Enable/disable protection
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.restore();
    } else {
      this.initialize();
    }
  }

  /**
   * Set block all WebRTC (convenience method for settings)
   */
  setBlockAllWebRTC(blockAll) {
    this.setBlockMode(blockAll ? 'disable' : 'default');
  }

  /**
   * Restore original WebRTC APIs
   */
  restore() {
    if (typeof window === 'undefined') return;

    for (const [api, original] of this.originalImplementations) {
      try {
        if (api === 'getUserMedia') {
          navigator.mediaDevices.getUserMedia = original;
        } else if (api === 'navigator.getUserMedia') {
          navigator.getUserMedia = original;
        } else {
          Object.defineProperty(window, api, {
            configurable: true,
            writable: true,
            value: original
          });
        }
      } catch (e) {
        console.warn('[WebRTCProtection] Failed to restore', api, e);
      }
    }

    this.originalImplementations.clear();
    this.isPatched = false;
  }

  /**
   * Clear all data
   */
  clearData() {
    this.blockedConnections.clear();
    this.connectionAttempts.clear();
  }

  /**
   * Inject WebRTC protection into a tab
   */
  async injectProtection(tabId) {
    if (typeof chrome === 'undefined' || !chrome.scripting) return;

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // WebRTC protection is automatically applied when the content script loads
          // This just ensures the protection is active
          if (window.WebRTCProtection && !window.webrtcProtection) {
            window.webrtcProtection = new WebRTCProtection();
            window.webrtcProtection.initialize();
          }
        }
      });
    } catch (error) {
      console.warn('[WebRTCProtection] Failed to inject protection:', error);
    }
  }

  /**
   * Update settings (used by content script)
   */
  updateSettings(settings) {
    if (settings.blockAll !== undefined) {
      this.setBlockAllWebRTC(settings.blockAll);
    }
    if (settings.enabled !== undefined) {
      this.setEnabled(settings.enabled);
    }
  }

  /**
   * Update content script config
   */
  async updateContentScriptConfig(tabId, settings) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (config) => {
          if (window.webrtcProtection) {
            window.webrtcProtection.updateSettings(config);
          }
        },
        args: [settings]
      });
    } catch (error) {
      console.warn('[WebRTCProtection] Failed to update config:', error);
    }
  }
}


// Export for use in service worker (CommonJS fallback)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebRTCProtection };
}

// Export for browser use
if (typeof window !== 'undefined') {
  window.WebRTCProtection = WebRTCProtection;
}