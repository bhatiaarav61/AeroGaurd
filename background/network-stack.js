/**
 * Network Stack
 * Handles network-level operations for Brave-like ad blocking:
 * DNS resolution, CNAME uncloaking, HTTPS upgrading, DNS-over-HTTPS
 */

const DEFAULT_DOH_SERVERS = [
  'https://dns.google/dns-query',
  'https://dns.cloudflare.com/dns-query',
  'https://dns.quad9.net/dns-query'
];

// CNAME uncloaking - resolves CNAME chains to actual domains
class CNAMEUncloaker {
  constructor() {
    this.cache = new Map();
  }

  async resolve(cnameDomain) {
    if (this.cache.has(cnameDomain)) {
      return this.cache.get(cnameDomain);
    }

    try {
      // Perform CNAME lookup via DNS-over-HTTPS
      const response = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(cnameDomain)}&type=CNAME`
      );
      const data = await response.json();

      if (data.Answer && data.Answer.length > 0) {
        const target = data.Answer[0].data.replace(/\.$/, '');
        this.cache.set(cnameDomain, target);
        return target;
      }
    } catch (e) {
      console.warn(`[AeroGuard] CNAME lookup failed for ${cnameDomain}:`, e);
    }

    return null;
  }

  clearCache() {
    this.cache.clear();
  }
}

// HTTPS Upgrader - forces HTTPS connections
class HTTPSUpgrader {
  constructor() {
    this.upgradedDomains = new Set([
      'googlevideo.com',
      'youtube.com',
      'google.com',
      'doubleclick.net',
      'googleadservices.com',
      'googletagmanager.com',
      'google-analytics.com',
      'googlesyndication.com',
      'googleads.com',
      'googleadapis.com',
      'facebook.net',
      'facebook.com',
      'connect.facebook.net',
      'analytics.twitter.com',
      'platform.twitter.com',
      'syndication.twitter.com',
      'googleads.g.doubleclick.net'
    ]);
  }

  /** Check if URL should be upgraded to HTTPS */
  shouldUpgrade(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' && this.isUpgradable(parsed.hostname);
    } catch {
      return false;
    }
  }

  /** Check if domain is in upgradable list */
  isUpgradable(hostname) {
    for (const domain of this.upgradedDomains) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return true;
      }
    }
    return false;
  }

  /** Upgrade HTTP URL to HTTPS */
  upgrade(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:') {
        parsed.protocol = 'https:';
        return parsed.toString();
      }
    } catch {
      // Return original on error
    }
    return url;
  }

  /** Add custom domain to upgrade list */
  addDomain(domain) {
    this.upgradedDomains.add(domain.toLowerCase());
  }
}

// DNS-over-HTTPS client
class DOHClient {
  constructor(servers = DEFAULT_DOH_SERVERS) {
    this.servers = servers;
    this.cache = new Map();
    this.currentServer = 0;
  }

  /** Resolve a domain via DoH */
  async resolve(domain, type = 'A') {
    const cacheKey = `${domain}:${type}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const server = this.servers[this.currentServer % this.servers.length];
    this.currentServer++;

    try {
      const url = `${server}?name=${encodeURIComponent(domain)}&type=${type}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/dns-json' }
      });
      const data = await response.json();

      if (data.Answer && data.Answer.length > 0) {
        const result = data.Answer.map(a => a.data);
        this.cache.set(cacheKey, result);
        return result;
      }
    } catch (e) {
      console.warn(`[AeroGuard] DoH lookup failed for ${domain}:`, e);
    }

    return null;
  }

  clearCache() {
    this.cache.clear();
  }
}

// Network stack singleton
const networkStack = {
  cnameUncloaker: new CNAMEUncloaker(),
  httpsUpgrader: new HTTPSUpgrader(),
  dohClient: new DOHClient(),

  /** Check and upgrade HTTP URL to HTTPS */
  upgradeHTTPS(url) {
    return this.httpsUpgrader.upgrade(url);
  },

  /** Resolve CNAME chain */
  async resolveCNAME(domain) {
    return this.cnameUncloaker.resolve(domain);
  },

  /** Perform DNS-over-HTTPS lookup */
  async dohLookup(domain, type = 'A') {
    return this.dohClient.resolve(domain, type);
  },

  /** Clear all caches */
  clearCaches() {
    this.cnameUncloaker.clearCache();
    this.dohClient.clearCache();
  }
};

export { networkStack, CNAMEUncloaker, HTTPSUpgrader, DOHClient };
export default networkStack;