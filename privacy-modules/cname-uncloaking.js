/**
 * CNAME Uncloaking Module
 * Detects CNAME records pointing to tracking domains and blocks requests
 * to resolved IPs of tracking domains
 *
 * Based on Brave's CNAME uncloaking implementation
 */

class CNAMEUncloaking {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.dnsCache = new Map();
    this.trackingDomains = new Set(options.trackingDomains || []);
    this.cnameCache = new Map();
    this.blockedDomains = new Set();
    this.resolver = options.resolver || this.defaultResolver.bind(this);
    this.whitelistedCNAMEs = new Set(options.whitelistedCNAMEs || []);

    // Default known tracking CNAME patterns
    this.trackingPatterns = [
      /\.googlesyndication\.com$/,
      /\.doubleclick\.net$/,
      /\.googleadservices\.com$/,
      /\.googletagmanager\.com$/,
      /\.facebook\.net$/,
      /\.facebook\.com$/,
      /\.ads\.facebook\.com$/,
      /\.ads\.twitter\.com$/,
      /\.analytics\.twitter\.com$/,
      /\.ads\.linkedin\.com$/,
      /\.analytics\.linkedin\.com$/,
      /\.ads\.pinterest\.com$/,
      /\.analytics\.pinterest\.com$/,
      /\.ads\.tiktok\.com$/,
      /\.analytics\.tiktok\.com$/,
      /\.ads\.snapchat\.com$/,
      /\.analytics\.snapchat\.com$/,
      /\.amazon-adsystem\.com$/,
      /\.amazonaws\.com$/,
      /\.cloudfront\.net$/,
      /\.akamaihd\.net$/,
      /\.akamaitechnologies\.com$/,
      /\.edgekey\.net$/,
      /\.edgesuite\.net$/,
      /\.fastly\.net$/,
      /\.cloudflare\.net$/,
      /\.quantserve\.com$/,
      /\.scorecardresearch\.com$/,
      /\.rubiconproject\.com$/,
      /\.pubmatic\.com$/,
      /\.openx\.net$/,
      /\.adnxs\.com$/,
      /\.criteo\.com$/,
      /\.outbrain\.com$/,
      /\.taboola\.com$/,
      /\.adsrvr\.org$/,
      /\.adform\.net$/,
      /\.adscale\.de$/,
      /\.adswizz\.com$/,
      /\.advertising\.com$/,
      /\.advertising\.yahoo\.com$/,
      /\.atdmt\.com$/,
      /\.bluekai\.com$/,
      /\.casalemedia\.com$/,
      /\.cxense\.com$/,
      /\.demdex\.net$/,
      /\.dotomi\.com$/,
      /\.everesttech\.net$/,
      /\.exelator\.com$/,
      /\.eyeota\.net$/,
      /\.flashtalking\.com$/,
      /\.gemius\.pl$/,
      /\.gumgum\.com$/,
      /\.imrworldwide\.com$/,
      /\.ixnp\.net$/,
      /\.klaviyo\.com$/,
      /\.krux\.com$/,
      /\.lijit\.com$/,
      /\.lotame\.com$/,
      /\.mathtag\.com$/,
      /\.media\.net$/,
      /\.mediamath\.com$/,
      /\.moatads\.com$/,
      /\.nanigans\.com$/,
      /\.neodatagroup\.com$/,
      /\.nielsen\.com$/,
      /\.parsely\.com$/,
      /\.pixel\.com$/,
      /\.quantcast\.com$/,
      /\.radiumone\.com$/,
      /\.rfihub\.com$/,
      /\.rlcdn\.com$/,
      /\.rubiconproject\.com$/,
      /\.semasio\.com$/,
      /\.serverbid\.com$/,
      /\.sharethrough\.com$/,
      /\.simpli\.fi$/,
      /\.smaato\.net$/,
      /\.smartadserver\.com$/,
      /\.sovrn\.com$/,
      /\.specificmedia\.com$/,
      /\.stickyadstv\.com$/,
      /\.tapad\.com$/,
      /\.teads\.tv$/,
      /\.thetradedesk\.com$/,
      /\.triplelift\.com$/,
      /\.turn\.com$/,
      /\.veruta\.com$/,
      /\.vidible\.tv$/,
      /\.visualdna\.com$/,
      /\.w55c\.net$/,
      /\.yieldlab\.net$/,
      /\.yieldmo\.com$/,
      /\.yadro\.ru$/,
      /\.yieldoptimizer\.com$/,
      /\.adzerk\.net$/,
      /\.adblade\.com$/,
      /\.adskeeper\.co\.uk$/,
      /\.adsupply\.com$/,
      /\.adup-tech\.com$/,
      /\.adzerk\.net$/,
      /\.bidtheatre\.com$/,
      /\.bidswitch\.net$/,
      /\.bidtellect\.com$/,
      /\.conversantmedia\.com$/,
      /\.dataxu\.com$/,
      /\.districtm\.io$/,
      /\.dyntrk\.com$/,
      /\.eyeviewads\.com$/,
      /\.freewheel\.com$/,
      /\.googleadservices\.com$/,
      /\.googleapis\.com$/,
      /\.gumgum\.com$/,
      /\.hb-api\.com$/,
      /\.indexexchange\.com$/,
      /\.inner-active\.com$/,
      /\.innity\.net$/,
      /\.ipredictive\.com$/,
      /\.krxd\.net$/,
      /\.loopme\.me$/,
      /\.magnite\.com$/,
      /\.media\.net$/,
      /\.mediamath\.com$/,
      /\.netmng\.com$/,
      /\.nexage\.com$/,
      /\.openx\.net$/,
      /\.platform\.io$/,
      /\.prebid\.org$/,
      /\.pulsepoint\.com$/,
      /\.quantcast\.com$/,
      /\.realytics\.com$/,
      /\.rhythmone\.com$/,
      /\.rockerbox\.com$/,
      /\.rokt\.com$/,
      /\.rtbhouse\.com$/,
      /\.rtk\.io$/,
      /\.rubiconproject\.com$/,
      /\.smaato\.net$/,
      /\.smartadserver\.com$/,
      /\.sovrn\.com$/,
      /\.spotx\.tv$/,
      /\.stackadapt\.com$/,
      /\.taboola\.com$/,
      /\.teads\.tv$/,
      /\.thetradedesk\.com$/,
      /\.tremorvideo\.com$/,
      /\.triplelift\.com$/,
      /\.turn\.com$/,
      /\.unruly\.co\.uk$/,
      /\.verizonmedia\.com$/,
      /\.vidible\.tv$/,
      /\.videoamp\.com$/,
      /\.videoplaza\.tv$/,
      /\.wunderkind\.com$/,
      /\.yieldlab\.net$/,
      /\.yieldmo\.com$/,
      /\.yieldoptimizer\.com$/,
      /\.zergnet\.com$/,
      /\.zvelo\.com$/
    ];
  }

  /**
   * Default DNS resolver using DNS-over-HTTPS
   */
  async defaultResolver(hostname) {
    try {
      // Try multiple DoH providers for reliability
      const providers = [
        `https://cloudflare-dns.com/dns-query?name=${hostname}&type=CNAME`,
        `https://dns.google/resolve?name=${hostname}&type=CNAME`,
        `https://doh.opendns.com/dns-query?name=${hostname}&type=CNAME`
      ];

      for (const provider of providers) {
        try {
          const response = await fetch(provider, {
            headers: { 'Accept': 'application/dns-json' },
            signal: AbortSignal.timeout(5000)
          });

          if (response.ok) {
            const data = await response.json();
            if (data.Answer) {
              for (const answer of data.Answer) {
                if (answer.type === 5) { // CNAME record
                  return answer.data.replace(/\.$/, '');
                }
              }
            }
          }
        } catch (e) {
          // Try next provider
        }
      }
      return null;
    } catch (error) {
      console.warn('[CNAMEUncloaking] DNS resolution failed:', error);
      return null;
    }
  }

  /**
   * Check if a domain matches known tracking patterns
   */
  isTrackingDomain(domain) {
    const normalized = domain.toLowerCase().replace(/\.$/, '');

    // Check exact matches
    if (this.trackingDomains.has(normalized)) {
      return true;
    }

    // Check pattern matches
    for (const pattern of this.trackingPatterns) {
      if (pattern.test(normalized)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Resolve CNAME chain for a domain
   */
  async resolveCNAMEChain(domain) {
    const normalized = domain.toLowerCase().replace(/\.$/, '');

    // Check cache first
    if (this.cnameCache.has(normalized)) {
      const cached = this.cnameCache.get(normalized);
      if (Date.now() - cached.timestamp < 3600000) { // 1 hour cache
        return cached.chain;
      }
    }

    const chain = [normalized];
    let current = normalized;
    let depth = 0;
    const maxDepth = 10;

    while (depth < maxDepth) {
      const cname = await this.resolver(current);

      if (!cname || cname === current) {
        break;
      }

      const normalizedCNAME = cname.toLowerCase().replace(/\.$/, '');

      // Check for loops
      if (chain.includes(normalizedCNAME)) {
        console.warn('[CNAMEUncloaking] CNAME loop detected:', chain);
        break;
      }

      chain.push(normalizedCNAME);
      current = normalizedCNAME;
      depth++;
    }

    // Cache the result
    this.cnameCache.set(normalized, {
      chain,
      timestamp: Date.now()
    });

    return chain;
  }

  /**
   * Check if a domain (or its CNAME chain) is a tracking domain
   */
  async isTrackingCNAME(domain) {
    if (!this.enabled) return false;

    const normalized = domain.toLowerCase().replace(/\.$/, '');

    // Check if already blocked
    if (this.blockedDomains.has(normalized)) {
      return true;
    }

    // Check whitelist
    if (this.whitelistedCNAMEs.has(normalized)) {
      return false;
    }

    // Direct match
    if (this.isTrackingDomain(normalized)) {
      this.blockedDomains.add(normalized);
      return true;
    }

    // Resolve CNAME chain
    const chain = await this.resolveCNAMEChain(normalized);

    // Check each domain in the chain
    for (const cnameDomain of chain) {
      if (this.isTrackingDomain(cnameDomain)) {
        // Block the original domain and all intermediate CNAMEs
        for (const d of chain) {
          this.blockedDomains.add(d);
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Get the resolved tracking domain for a given domain
   */
  async getTrackingDomain(domain) {
    const normalized = domain.toLowerCase().replace(/\.$/, '');
    const chain = await this.resolveCNAMEChain(normalized);

    for (const cnameDomain of chain) {
      if (this.isTrackingDomain(cnameDomain)) {
        return cnameDomain;
      }
    }

    return null;
  }

  /**
   * Add a domain to the tracking list
   */
  addTrackingDomain(domain) {
    const normalized = domain.toLowerCase().replace(/\.$/, '');
    this.trackingDomains.add(normalized);
    this.blockedDomains.add(normalized);
  }

  /**
   * Add multiple tracking domains
   */
  addTrackingDomains(domains) {
    for (const domain of domains) {
      this.addTrackingDomain(domain);
    }
  }

  /**
   * Whitelist a CNAME (allow it even if it matches tracking patterns)
   */
  whitelistCNAME(domain) {
    const normalized = domain.toLowerCase().replace(/\.$/, '');
    this.whitelistedCNAMEs.add(normalized);
    this.blockedDomains.delete(normalized);
  }

  /**
   * Remove a domain from the tracking list
   */
  removeTrackingDomain(domain) {
    const normalized = domain.toLowerCase().replace(/\.$/, '');
    this.trackingDomains.delete(normalized);
    this.blockedDomains.delete(normalized);
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.dnsCache.clear();
    this.cnameCache.clear();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      trackingDomainsCount: this.trackingDomains.size,
      blockedDomainsCount: this.blockedDomains.size,
      whitelistedCNAMEsCount: this.whitelistedCNAMEs.size,
      dnsCacheSize: this.dnsCache.size,
      cnameCacheSize: this.cnameCache.size
    };
  }

  /**
   * Enable/disable the module
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Export blocked domains for syncing
   */
  exportBlockedDomains() {
    return Array.from(this.blockedDomains);
  }

  /**
   * Import blocked domains
   */
  importBlockedDomains(domains) {
    for (const domain of domains) {
      this.blockedDomains.add(domain.toLowerCase().replace(/\.$/, ''));
    }
  }

  /**
   * Load tracking domains from a list (e.g., EasyPrivacy CNAME list)
   */
  async loadTrackingDomainsFromList(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const text = await response.text();
      const lines = text.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('!') && !trimmed.startsWith('#')) {
          this.addTrackingDomain(trimmed);
        }
      }

      console.log(`[CNAMEUncloaking] Loaded ${this.trackingDomains.size} tracking domains from ${url}`);
    } catch (error) {
      console.error('[CNAMEUncloaking] Failed to load tracking domains:', error);
    }
  }
}


// Export for use in service worker (CommonJS fallback)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CNAMEUncloaking };
}

// Export for browser use
if (typeof window !== 'undefined') {
  window.CNAMEUncloaking = CNAMEUncloaking;
}