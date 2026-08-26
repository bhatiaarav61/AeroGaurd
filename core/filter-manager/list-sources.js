/**
 * AeroGuard Filter Manager - List Sources Registry
 * Curated, verified sources with fallback mirrors, checksum verification, and signature validation
 *
 * @module core/filter-manager/list-sources
 * @version 1.1.0
 */

'use strict';

/**
 * Mirror health status constants
 * @readonly
 * @enum {string}
 */
const MirrorHealth = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown'
};

/**
 * Signature verification status
 * @readonly
 * @enum {string}
 */
const SignatureStatus = {
  VALID: 'valid',
  INVALID: 'invalid',
  MISSING: 'missing',
  ERROR: 'error',
  NOT_VERIFIED: 'not_verified'
};

/**
 * Default health check configuration
 * @readonly
 * @type {Object}
 */
const DEFAULT_HEALTH_CONFIG = {
  timeout: 5000,
  maxFailures: 3,
  recoveryWindow: 300000, // 5 minutes
  checkInterval: 60000 // 1 minute
};

/**
 * Default signature verification configuration
 * @readonly
 * @type {Object}
 */
const DEFAULT_SIGNATURE_CONFIG = {
  timeout: 10000,
  requireSignature: false, // Set true for critical lists
  allowedAlgorithms: ['RSA-SHA256', 'RSA-SHA512', 'ECDSA-SHA256', 'ED25519'],
  trustedKeys: new Map() // listId -> public key info
};

/**
 * List source definitions with primary CDN and fallback mirrors
 * Each source contains metadata, URLs, integrity information, and signature validation
 * @readonly
 * @type {Map<string, ListSource>}
 */
const LIST_SOURCES = new Map([
  /**
   * EasyList - Primary ad-blocking filter list
   */
  ['easylist', {
    id: 'easylist',
    name: 'EasyList',
    description: 'Primary filter list for ad blocking',
    category: 'ads',
    maintainer: 'EasyList Authors',
    homepage: 'https://easylist.to/',
    license: 'CC BY-SA 3.0',
    primary: {
      url: 'https://easylist.to/easylist/easylist.txt',
      mirror: 'https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist.txt',
      headers: { 'Accept': 'text/plain' }
    },
    mirrors: [
      {
        url: 'https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist.txt',
        name: 'GitHub Raw',
        priority: 1,
        region: 'global'
      },
      {
        url: 'https://cdn.jsdelivr.net/gh/easylist/easylist@master/easylist/easylist.txt',
        name: 'jsDelivr CDN',
        priority: 2,
        region: 'global'
      },
      {
        url: 'https://easylist-downloads.adblockplus.org/easylist.txt',
        name: 'Adblock Plus CDN',
        priority: 3,
        region: 'global'
      }
    ],
    regionalVariants: {
      'easylist-china': 'https://easylist.to/easylistchina/easylistchina.txt',
      'easylist-germany': 'https://easylist.to/easylistgermany/easylistgermany.txt',
      'easylist-spain': 'https://easylist.to/easylistspain/easylistspain.txt',
      'easylist-france': 'https://easylist.to/easylistfr/easylistfr.txt',
      'easylist-italy': 'https://easylist.to/easylistitaly/easylistitaly.txt',
      'easylist-netherlands': 'https://easylist.to/easylistnl/easylistnl.txt',
      'easylist-poland': 'https://easylist.to/easylistpoland/easylistpoland.txt',
      'easylist-russia': 'https://easylist.to/ruadlist/easylistru.txt',
      'easylist-turkey': 'https://easylist.to/easylistturkey/easylistturkey.txt',
      'easylist-ukraine': 'https://easylist.to/easylistukraine/easylistukraine.txt'
    },
    integrity: {
      algorithm: 'sha256',
      // Updated periodically - verify against known good hash
      expectedHash: null, // Set to known hash for verification
      verifyOnFetch: true
    },
    signature: {
      // GPG signature verification - EasyList provides .asc signatures
      enabled: true,
      algorithm: 'RSA-SHA256',
      // Signature URLs follow the pattern: list_url + .asc
      primaryUrl: 'https://easylist.to/easylist/easylist.txt.asc',
      mirrorUrls: [
        'https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist.txt.asc',
        'https://cdn.jsdelivr.net/gh/easylist/easylist@master/easylist/easylist.txt.asc',
        'https://easylist-downloads.adblockplus.org/easylist.txt.asc'
      ],
      // EasyList public key fingerprint (to be populated from trusted source)
      keyId: '0x6A6B5F8F', // Example - replace with actual
      keyUrl: 'https://easylist.to/easylist.gpg.key',
      requireValidSignature: true,
      verifyOnFetch: true
    },
    updateFrequency: 86400000, // 24 hours
    lastModified: null,
    etag: null,
    enabled: true,
    critical: true
  }],

  /**
   * EasyPrivacy - Privacy protection filter list
   */
  ['easyprivacy', {
    id: 'easyprivacy',
    name: 'EasyPrivacy',
    description: 'Privacy protection filter list (tracking, analytics)',
    category: 'privacy',
    maintainer: 'EasyList Authors',
    homepage: 'https://easylist.to/',
    license: 'CC BY-SA 3.0',
    primary: {
      url: 'https://easylist.to/easylist/easyprivacy.txt',
      mirror: 'https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy.txt',
      headers: { 'Accept': 'text/plain' }
    },
    mirrors: [
      {
        url: 'https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy.txt',
        name: 'GitHub Raw',
        priority: 1,
        region: 'global'
      },
      {
        url: 'https://cdn.jsdelivr.net/gh/easylist/easylist@master/easyprivacy/easyprivacy.txt',
        name: 'jsDelivr CDN',
        priority: 2,
        region: 'global'
      },
      {
        url: 'https://easylist-downloads.adblockplus.org/easyprivacy.txt',
        name: 'Adblock Plus CDN',
        priority: 3,
        region: 'global'
      }
    ],
    integrity: {
      algorithm: 'sha256',
      expectedHash: null,
      verifyOnFetch: true
    },
    signature: {
      enabled: true,
      algorithm: 'RSA-SHA256',
      primaryUrl: 'https://easylist.to/easylist/easyprivacy.txt.asc',
      mirrorUrls: [
        'https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy.txt.asc',
        'https://cdn.jsdelivr.net/gh/easylist/easylist@master/easyprivacy/easyprivacy.txt.asc',
        'https://easylist-downloads.adblockplus.org/easyprivacy.txt.asc'
      ],
      keyId: '0x6A6B5F8F',
      keyUrl: 'https://easylist.to/easylist.gpg.key',
      requireValidSignature: true,
      verifyOnFetch: true
    },
    updateFrequency: 86400000,
    lastModified: null,
    etag: null,
    enabled: true,
    critical: true
  }],

  /**
   * uBlock Origin filters - Comprehensive filter set
   */
  ['ublock-filters', {
    id: 'ublock-filters',
    name: 'uBlock Origin Filters',
    description: 'uBlock Origin comprehensive filter lists',
    category: 'ads',
    maintainer: 'uBlock Origin Team',
    homepage: 'https://github.com/uBlockOrigin/uAssets',
    license: 'GPL-3.0',
    primary: {
      url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
      mirror: 'https://cdn.jsdelivr.net/gh/uBlockOrigin/uAssets@master/filters/filters.txt',
      headers: { 'Accept': 'text/plain' }
    },
    mirrors: [
      {
        url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
        name: 'GitHub Raw (uAssets)',
        priority: 1,
        region: 'global'
      },
      {
        url: 'https://cdn.jsdelivr.net/gh/uBlockOrigin/uAssets@master/filters/filters.txt',
        name: 'jsDelivr CDN',
        priority: 2,
        region: 'global'
      },
      {
        url: 'https://gitcdn.xyz/repo/uBlockOrigin/uAssets/master/filters/filters.txt',
        name: 'GitCDN',
        priority: 3,
        region: 'global'
      }
    ],
    subLists: {
      'ublock-annoyances': 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt',
      'ublock-badware': 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt',
      'ublock-privacy': 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt',
      'ublock-resource-abuse': 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/resource-abuse.txt',
      'ublock-unbreak': 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt',
      'ublock-filters': 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
      'ublock-experiments': 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/experiments.txt'
    },
    integrity: {
      algorithm: 'sha256',
      expectedHash: null,
      verifyOnFetch: true
    },
    signature: {
      enabled: true,
      algorithm: 'RSA-SHA256',
      // uBlock Origin signs releases via GitHub - verify via GitHub commit signatures
      primaryUrl: 'https://api.github.com/repos/uBlockOrigin/uAssets/commits?path=filters/filters.txt&per_page=1',
      mirrorUrls: [],
      keyId: 'github:uBlockOrigin',
      keyUrl: 'https://github.com/uBlockOrigin.uAssets.gpg',
      requireValidSignature: false, // GitHub commit verification instead of direct GPG
      verifyOnFetch: false // Verified via GitHub API
    },
    updateFrequency: 86400000,
    lastModified: null,
    etag: null,
    enabled: true,
    critical: true
  }],

  /**
   * Fanboy's lists - Regional and enhanced filters
   */
  ['fanboy-annoyance', {
    id: 'fanboy-annoyance',
    name: "Fanboy's Annoyance List",
    description: "Blocks social media widgets, annoyances, and anti-adblock",
    category: 'annoyances',
    maintainer: 'Fanboy',
    homepage: 'https://fanboy.co.nz/',
    license: 'CC BY-SA 3.0',
    primary: {
      url: 'https://easylist.to/fanboy-annoyance/fanboy-annoyance.txt',
      mirror: 'https://fanboy.co.nz/r/fanboy-annoyance.txt',
      headers: { 'Accept': 'text/plain' }
    },
    mirrors: [
      {
        url: 'https://fanboy.co.nz/r/fanboy-annoyance.txt',
        name: 'Fanboy.co.nz',
        priority: 1,
        region: 'global'
      },
      {
        url: 'https://raw.githubusercontent.com/ryanbr/fanboy-adblock/master/fanboy-annoyance.txt',
        name: 'GitHub Mirror',
        priority: 2,
        region: 'global'
      },
      {
        url: 'https://cdn.jsdelivr.net/gh/ryanbr/fanboy-adblock@master/fanboy-annoyance.txt',
        name: 'jsDelivr CDN',
        priority: 3,
        region: 'global'
      }
    ],
    integrity: {
      algorithm: 'sha256',
      expectedHash: null,
      verifyOnFetch: false
    },
    updateFrequency: 86400000,
    lastModified: null,
    etag: null,
    enabled: true,
    critical: false
  }],

  ['fanboy-social', {
    id: 'fanboy-social',
    name: "Fanboy's Social Blocking List",
    description: 'Blocks social media buttons and tracking',
    category: 'social',
    maintainer: 'Fanboy',
    homepage: 'https://fanboy.co.nz/',
    license: 'CC BY-SA 3.0',
    primary: {
      url: 'https://easylist.to/fanboy-social/fanboy-social.txt',
      mirror: 'https://fanboy.co.nz/r/fanboy-social.txt',
      headers: { 'Accept': 'text/plain' }
    },
    mirrors: [
      {
        url: 'https://fanboy.co.nz/r/fanboy-social.txt',
        name: 'Fanboy.co.nz',
        priority: 1,
        region: 'global'
      },
      {
        url: 'https://raw.githubusercontent.com/ryanbr/fanboy-adblock/master/fanboy-social.txt',
        name: 'GitHub Mirror',
        priority: 2,
        region: 'global'
      }
    ],
    integrity: {
      algorithm: 'sha256',
      expectedHash: null,
      verifyOnFetch: false
    },
    updateFrequency: 86400000,
    lastModified: null,
    etag: null,
    enabled: true,
    critical: false
  }],

  ['fanboy-cookiemonster', {
    id: 'fanboy-cookiemonster',
    name: "Fanboy's Cookie Monster List",
    description: 'Blocks cookie notices and GDPR banners',
    category: 'cookies',
    maintainer: 'Fanboy',
    homepage: 'https://fanboy.co.nz/',
    license: 'CC BY-SA 3.0',
    primary: {
      url: 'https://easylist.to/fanboy-cookiemonster/fanboy-cookiemonster.txt',
      mirror: 'https://fanboy.co.nz/r/fanboy-cookiemonster.txt',
      headers: { 'Accept': 'text/plain' }
    },
    mirrors: [
      {
        url: 'https://fanboy.co.nz/r/fanboy-cookiemonster.txt',
        name: 'Fanboy.co.nz',
        priority: 1,
        region: 'global'
      },
      {
        url: 'https://raw.githubusercontent.com/ryanbr/fanboy-adblock/master/fanboy-cookiemonster.txt',
        name: 'GitHub Mirror',
        priority: 2,
        region: 'global'
      }
    ],
    integrity: {
      algorithm: 'sha256',
      expectedHash: null,
      verifyOnFetch: false
    },
    updateFrequency: 86400000,
    lastModified: null,
    etag: null,
    enabled: true,
    critical: false
  }],

  /**
   * Regional lists organized by country/region
   */
  ['regional', {
    id: 'regional',
    name: 'Regional Filter Lists',
    description: 'Country-specific filter lists for regional ad blocking',
    category: 'regional',
    maintainer: 'Various',
    homepage: 'https://easylist.to/',
    license: 'Various',
    primary: {
      url: 'https://easylist.to/',
      mirror: 'https://github.com/easylist/easylist',
      headers: { 'Accept': 'text/html' }
    },
    mirrors: [],
    regionalLists: {
      // Asia Pacific
      'japan': {
        id: 'adguard-japanese',
        name: 'AdGuard Japanese Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/JapaneseFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/JapaneseFilter/sections/adservers.txt'
        ],
        enabled: true
      },
      'china': {
        id: 'easylist-china',
        name: 'EasyList China',
        url: 'https://easylist.to/easylistchina/easylistchina.txt',
        mirrors: [
          'https://raw.githubusercontent.com/easylist/easylist/master/easylistchina/easylistchina.txt'
        ],
        enabled: true
      },
      'korea': {
        id: 'adguard-korean',
        name: 'AdGuard Korean Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/KoreanFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/KoreanFilter/sections/adservers.txt'
        ],
        enabled: true
      },
      'taiwan': {
        id: 'adguard-taiwan',
        name: 'AdGuard Traditional Chinese Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/TraditionalChineseFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/TraditionalChineseFilter/sections/adservers.txt'
        ],
        enabled: true
      },
      'vietnam': {
        id: 'adguard-vietnamese',
        name: 'AdGuard Vietnamese Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/VietnameseFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/VietnameseFilter/sections/adservers.txt'
        ],
        enabled: true
      },
      'thailand': {
        id: 'adguard-thai',
        name: 'AdGuard Thai Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/ThaiFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/ThaiFilter/sections/adservers.txt'
        ],
        enabled: true
      },
      'indonesia': {
        id: 'adguard-indonesian',
        name: 'AdGuard Indonesian Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/IndonesianFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/IndonesianFilter/sections/adservers.txt'
        ],
        enabled: true
      },

      // Europe
      'germany': {
        id: 'easylist-germany',
        name: 'EasyList Germany',
        url: 'https://easylist.to/easylistgermany/easylistgermany.txt',
        mirrors: [
          'https://raw.githubusercontent.com/easylist/easylist/master/easylistgermany/easylistgermany.txt'
        ],
        enabled: true
      },
      'france': {
        id: 'easylist-france',
        name: 'EasyList France',
        url: 'https://easylist.to/easylistfr/easylistfr.txt',
        mirrors: [
          'https://raw.githubusercontent.com/easylist/easylist/master/easylistfr/easylistfr.txt'
        ],
        enabled: true
      },
      'italy': {
        id: 'easylist-italy',
        name: 'EasyList Italy',
        url: 'https://easylist.to/easylistitaly/easylistitaly.txt',
        mirrors: [
          'https://raw.githubusercontent.com/easylist/easylist/master/easylistitaly/easylistitaly.txt'
        ],
        enabled: true
      },
      'netherlands': {
        id: 'easylist-netherlands',
        name: 'EasyList Netherlands',
        url: 'https://easylist.to/easylistnl/easylistnl.txt',
        mirrors: [
          'https://raw.githubusercontent.com/easylist/easylist/master/easylistnl/easylistnl.txt'
        ],
        enabled: true
      },
      'poland': {
        id: 'easylist-poland',
        name: 'EasyList Poland',
        url: 'https://easylist.to/easylistpoland/easylistpoland.txt',
        mirrors: [
          'https://raw.githubusercontent.com/easylist/easylist/master/easylistpoland/easylistpoland.txt'
        ],
        enabled: true
      },
      'russia': {
        id: 'ruadlist',
        name: 'RU AdList',
        url: 'https://easylist.to/ruadlist/easylistru.txt',
        mirrors: [
          'https://raw.githubusercontent.com/easylist/easylist/master/ruadlist/easylistru.txt'
        ],
        enabled: true
      },
      'turkey': {
        id: 'easylist-turkey',
        name: 'EasyList Turkey',
        url: 'https://easylist.to/easylistturkey/easylistturkey.txt',
        mirrors: [
          'https://raw.githubusercontent.com/easylist/easylist/master/easylistturkey/easylistturkey.txt'
        ],
        enabled: true
      },
      'ukraine': {
        id: 'easylist-ukraine',
        name: 'EasyList Ukraine',
        url: 'https://easylist.to/easylistukraine/easylistukraine.txt',
        mirrors: [
          'https://raw.githubusercontent.com/easylist/easylist/master/easylistukraine/easylistukraine.txt'
        ],
        enabled: true
      },
      'czech': {
        id: 'adguard-czech',
        name: 'AdGuard Czech Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/CzechFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/CzechFilter/sections/adservers.txt'
        ],
        enabled: true
      },
      'hungary': {
        id: 'adguard-hungarian',
        name: 'AdGuard Hungarian Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/HungarianFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/HungarianFilter/sections/adservers.txt'
        ],
        enabled: true
      },
      'greece': {
        id: 'adguard-greek',
        name: 'AdGuard Greek Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/GreekFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/GreekFilter/sections/adservers.txt'
        ],
        enabled: true
      },
      'romania': {
        id: 'adguard-romanian',
        name: 'AdGuard Romanian Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/RomanianFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/RomanianFilter/sections/adservers.txt'
        ],
        enabled: true
      },
      'sweden': {
        id: 'adguard-swedish',
        name: 'AdGuard Swedish Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/SwedishFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/SwedishFilter/sections/adservers.txt'
        ],
        enabled: true
      },
      'denmark': {
        id: 'adguard-danish',
        name: 'AdGuard Danish Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/DanishFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/DanishFilter/sections/adservers.txt'
        ],
        enabled: true
      },
      'norway': {
        id: 'adguard-norwegian',
        name: 'AdGuard Norwegian Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/NorwegianFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/NorwegianFilter/sections/adservers.txt'
        ],
        enabled: true
      },
      'finland': {
        id: 'adguard-finnish',
        name: 'AdGuard Finnish Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/FinnishFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/FinnishFilter/sections/adservers.txt'
        ],
        enabled: true
      },

      // Americas
      'brazil': {
        id: 'adguard-portuguese',
        name: 'AdGuard Portuguese Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/PortugueseFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/PortugueseFilter/sections/adservers.txt'
        ],
        enabled: true
      },
      'mexico': {
        id: 'adguard-spanish',
        name: 'AdGuard Spanish Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/SpanishFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/SpanishFilter/sections/adservers.txt'
        ],
        enabled: true
      },
      'argentina': {
        id: 'adguard-spanish-ar',
        name: 'AdGuard Spanish (Argentina) Filter',
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/SpanishFilter/sections/adservers.txt',
        mirrors: [
          'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/SpanishFilter/sections/adservers.txt'
        ],
        enabled: true
      }
    },
    integrity: {
      algorithm: 'sha256',
      expectedHash: null,
      verifyOnFetch: false
    },
    updateFrequency: 86400000,
    enabled: true,
    critical: false
  }],

  /**
   * SponsorBlock - YouTube sponsor segment skipping
   */
  ['sponsorblock', {
    id: 'sponsorblock',
    name: 'SponsorBlock',
    description: 'Community-sourced YouTube sponsor segment database',
    category: 'sponsorblock',
    maintainer: 'Ajay Ramachandran',
    homepage: 'https://sponsor.ajay.app/',
    license: 'GPL-3.0',
    primary: {
      url: 'https://api.sponsor.ajay.app/api/skipSegments',
      mirror: 'https://raw.githubusercontent.com/AjayRamachandran/SponsorBlock/master/database/segments.json',
      headers: { 'Accept': 'application/json', 'User-Agent': 'AeroGuard/1.0' }
    },
    mirrors: [
      {
        url: 'https://api.sponsor.ajay.app/api/skipSegments',
        name: 'SponsorBlock API',
        priority: 1,
        region: 'global',
        type: 'api'
      },
      {
        url: 'https://sponsor.ajay.app/api/skipSegments',
        name: 'SponsorBlock API (alt)',
        priority: 2,
        region: 'global',
        type: 'api'
      },
      {
        url: 'https://raw.githubusercontent.com/AjayRamachandran/SponsorBlock/master/database/segments.json',
        name: 'GitHub Raw Database',
        priority: 3,
        region: 'global',
        type: 'static'
      },
      {
        url: 'https://cdn.jsdelivr.net/gh/AjayRamachandran/SponsorBlock@master/database/segments.json',
        name: 'jsDelivr CDN',
        priority: 4,
        region: 'global',
        type: 'static'
      }
    ],
    apiEndpoints: {
      getSegments: 'https://api.sponsor.ajay.app/api/skipSegments',
      getVideoInfo: 'https://api.sponsor.ajay.app/api/videoInfo',
      submitSegment: 'https://api.sponsor.ajay.app/api/segment',
      voteSegment: 'https://api.sponsor.ajay.app/api/vote',
      getUserInfo: 'https://api.sponsor.ajay.app/api/userInfo'
    },
    integrity: {
      algorithm: 'sha256',
      expectedHash: null,
      verifyOnFetch: false // API responses vary
    },
    updateFrequency: 3600000, // 1 hour for API, 24h for static
    lastModified: null,
    etag: null,
    enabled: true,
    critical: false,
    isApi: true
  }],

  /**
   * Heuristic engine - Self-hosted, dynamically generated
   */
  ['heuristic', {
    id: 'heuristic',
    name: 'Heuristic Engine Filters',
    description: 'Dynamically generated filters from heuristic analysis',
    category: 'heuristic',
    maintainer: 'AeroGuard',
    homepage: 'https://aeroguard.app/',
    license: 'Proprietary',
    primary: {
      url: 'https://filters.aeroguard.app/heuristic/filters.txt',
      mirror: 'https://cdn.aeroguard.app/heuristic/filters.txt',
      headers: { 'Accept': 'text/plain', 'User-Agent': 'AeroGuard/1.0' }
    },
    mirrors: [
      {
        url: 'https://filters.aeroguard.app/heuristic/filters.txt',
        name: 'Primary CDN',
        priority: 1,
        region: 'global'
      },
      {
        url: 'https://cdn.aeroguard.app/heuristic/filters.txt',
        name: 'Secondary CDN',
        priority: 2,
        region: 'global'
      },
      {
        url: 'https://cdn.jsdelivr.net/gh/aeroguard/heuristic-filters@main/filters.txt',
        name: 'jsDelivr Backup',
        priority: 3,
        region: 'global'
      }
    ],
    engineEndpoint: 'https://api.aeroguard.app/heuristic/generate',
    integrity: {
      algorithm: 'sha256',
      expectedHash: null,
      verifyOnFetch: true
    },
    updateFrequency: 3600000, // 1 hour
    lastModified: null,
    etag: null,
    enabled: true,
    critical: true,
    isDynamic: true
  }],

  /**
   * Custom user-provided lists
   */
  ['custom', {
    id: 'custom',
    name: 'Custom User Lists',
    description: 'User-provided filter list URLs with validation',
    category: 'custom',
    maintainer: 'User',
    homepage: '',
    license: 'User-defined',
    primary: {
      url: '',
      mirror: '',
      headers: { 'Accept': 'text/plain' }
    },
    mirrors: [],
    integrity: {
      algorithm: 'sha256',
      expectedHash: null,
      verifyOnFetch: false
    },
    updateFrequency: 86400000,
    lastModified: null,
    etag: null,
    enabled: true,
    critical: false,
    isCustom: true,
    validation: {
      requireHttps: true,
      allowedDomains: [
        'raw.githubusercontent.com',
        'cdn.jsdelivr.net',
        'gitcdn.xyz',
        'easylist.to',
        'fanboy.co.nz',
        'api.sponsor.ajay.app',
        'sponsor.ajay.app',
        'filters.aeroguard.app',
        'cdn.aeroguard.app',
        'adguardteam.github.io',
        'easylist-downloads.adblockplus.org'
      ],
      maxSize: 52428800, // 50 MB
      allowedContentTypes: ['text/plain', 'application/octet-stream']
    }
  }],

  /**
   * AdGuard Base Filters
   */
  ['adguard-base', {
    id: 'adguard-base',
    name: 'AdGuard Base Filter',
    description: 'AdGuard base filter for general ad blocking',
    category: 'ads',
    maintainer: 'AdGuard Team',
    homepage: 'https://github.com/AdguardTeam/AdguardFilters',
    license: 'GPL-3.0',
    primary: {
      url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/BaseFilter/sections/adservers.txt',
      mirror: 'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/BaseFilter/sections/adservers.txt',
      headers: { 'Accept': 'text/plain' }
    },
    mirrors: [
      {
        url: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/BaseFilter/sections/adservers.txt',
        name: 'GitHub Raw',
        priority: 1,
        region: 'global'
      },
      {
        url: 'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/BaseFilter/sections/adservers.txt',
        name: 'jsDelivr CDN',
        priority: 2,
        region: 'global'
      },
      {
        url: 'https://gitcdn.xyz/repo/AdguardTeam/AdguardFilters/master/BaseFilter/sections/adservers.txt',
        name: 'GitCDN',
        priority: 3,
        region: 'global'
      }
    ],
    subLists: {
      'adguard-tracking': 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/TrackingFilter/sections/adservers.txt',
      'adguard-social': 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/SocialFilter/sections/adservers.txt',
      'adguard-annoyances': 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/AnnoyancesFilter/sections/adservers.txt',
      'adguard-mobile': 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/MobileFilter/sections/adservers.txt',
      'adguard-dns': 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/DnsFilter/sections/adservers.txt'
    },
    integrity: {
      algorithm: 'sha256',
      expectedHash: null,
      verifyOnFetch: true
    },
    signature: {
      enabled: true,
      algorithm: 'RSA-SHA256',
      // AdGuard provides signed releases
      primaryUrl: 'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/BaseFilter/sections/adservers.txt.asc',
      mirrorUrls: [
        'https://cdn.jsdelivr.net/gh/AdguardTeam/AdguardFilters@master/BaseFilter/sections/adservers.txt.asc',
        'https://gitcdn.xyz/repo/AdguardTeam/AdguardFilters/master/BaseFilter/sections/adservers.txt.asc'
      ],
      keyId: 'AdguardTeam',
      keyUrl: 'https://github.com/AdguardTeam.gpg',
      requireValidSignature: true,
      verifyOnFetch: true
    },
    updateFrequency: 86400000,
    lastModified: null,
    etag: null,
    enabled: true,
    critical: true
  }],

  /**
   * OISD - One Integrated List
   */
  ['oisd', {
    id: 'oisd',
    name: 'OISD',
    description: 'One Integrated List for domains (ads, tracking, malware)',
    category: 'ads',
    maintainer: 'sjhgvr',
    homepage: 'https://oisd.nl/',
    license: 'CC BY-SA 4.0',
    primary: {
      url: 'https://oisd.nl/basic/',
      mirror: 'https://raw.githubusercontent.com/sjhgvr/oisd/main/basic.txt',
      headers: { 'Accept': 'text/plain' }
    },
    mirrors: [
      {
        url: 'https://oisd.nl/basic/',
        name: 'Primary OISD',
        priority: 1,
        region: 'global'
      },
      {
        url: 'https://raw.githubusercontent.com/sjhgvr/oisd/main/basic.txt',
        name: 'GitHub Raw',
        priority: 2,
        region: 'global'
      },
      {
        url: 'https://cdn.jsdelivr.net/gh/sjhgvr/oisd@main/basic.txt',
        name: 'jsDelivr CDN',
        priority: 3,
        region: 'global'
      }
    ],
    variants: {
      'basic': 'https://oisd.nl/basic/',
      'full': 'https://oisd.nl/',
      'nsfw': 'https://oisd.nl/nsfw/',
      'extra': 'https://oisd.nl/extra/'
    },
    integrity: {
      algorithm: 'sha256',
      expectedHash: null,
      verifyOnFetch: false
    },
    signature: {
      enabled: true,
      algorithm: 'RSA-SHA256',
      primaryUrl: 'https://oisd.nl/basic/.asc',
      mirrorUrls: [
        'https://raw.githubusercontent.com/sjhgvr/oisd/main/basic.txt.asc',
        'https://cdn.jsdelivr.net/gh/sjhgvr/oisd@main/basic.txt.asc'
      ],
      keyId: 'sjhgvr',
      keyUrl: 'https://github.com/sjhgvr.gpg',
      requireValidSignature: false,
      verifyOnFetch: false
    },
    updateFrequency: 86400000,
    lastModified: null,
    etag: null,
    enabled: true,
    critical: false
  }],

  /**
   * HaGeZi - Multi-purpose blocklists
   */
  ['hagezi', {
    id: 'hagezi',
    name: 'HaGeZi Blocklists',
    description: 'Multi-purpose blocklists for DNS and browser filtering',
    category: 'ads',
    maintainer: 'HaGeZi',
    homepage: 'https://hagezi.github.io/',
    license: 'MIT',
    primary: {
      url: 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/pro.txt',
      mirror: 'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@main/wildcard/pro.txt',
      headers: { 'Accept': 'text/plain' }
    },
    mirrors: [
      {
        url: 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/pro.txt',
        name: 'GitHub Raw',
        priority: 1,
        region: 'global'
      },
      {
        url: 'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@main/wildcard/pro.txt',
        name: 'jsDelivr CDN',
        priority: 2,
        region: 'global'
      }
    ],
    variants: {
      'pro': 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/pro.txt',
      'pro-plus': 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/pro.plus.txt',
      'ultimate': 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/ultimate.txt',
      'tif': 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/tif.txt',
      'multi': 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/multi.txt'
    },
    integrity: {
      algorithm: 'sha256',
      expectedHash: null,
      verifyOnFetch: false
    },
    signature: {
      enabled: true,
      algorithm: 'RSA-SHA256',
      primaryUrl: 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/pro.txt.asc',
      mirrorUrls: [
        'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@main/wildcard/pro.txt.asc'
      ],
      keyId: 'hagezi',
      keyUrl: 'https://github.com/hagezi.gpg',
      requireValidSignature: false,
      verifyOnFetch: false
    },
    updateFrequency: 86400000,
    lastModified: null,
    etag: null,
    enabled: true,
    critical: false
  }]
]);

/**
 * Mirror Selector - Round-robin with health tracking and automatic failover
 */
class MirrorSelector {
  constructor(healthConfig = {}) {
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...healthConfig };
    this.mirrorState = new Map(); // key: mirrorUrl -> { health, failures, lastCheck, lastSuccess }
    this.currentIndex = new Map(); // key: listId -> current mirror index
    this.listeners = new Set();
  }

  /**
   * Get the best available mirror for a list
   * @param {string} listId - List identifier
   * @param {Array} mirrors - Array of mirror objects
   * @returns {Object|null} Selected mirror or null if none available
   */
  getMirror(listId, mirrors) {
    if (!mirrors || mirrors.length === 0) {
      return null;
    }

    // Initialize current index if not set
    if (!this.currentIndex.has(listId)) {
      this.currentIndex.set(listId, 0);
    }

    let currentIndex = this.currentIndex.get(listId);
    const healthyMirrors = this.getHealthyMirrors(mirrors);

    if (healthyMirrors.length === 0) {
      // All mirrors unhealthy - return first as last resort
      this.notifyHealthChange(listId, mirrors[0], MirrorHealth.UNHEALTHY);
      return mirrors[0];
    }

    // Round-robin among healthy mirrors
    const selectedMirror = healthyMirrors[currentIndex % healthyMirrors.length];
    this.currentIndex.set(listId, (currentIndex + 1) % healthyMirrors.length);

    return selectedMirror;
  }

  /**
   * Get all healthy mirrors from the list
   * @param {Array} mirrors - Array of mirror objects
   * @returns {Array} Healthy mirrors
   */
  getHealthyMirrors(mirrors) {
    return mirrors.filter(mirror => {
      const state = this.mirrorState.get(mirror.url);
      if (!state) return true; // Unknown = healthy initially
      return state.health !== MirrorHealth.UNHEALTHY;
    });
  }

  /**
   * Record a successful fetch from a mirror
   * @param {string} mirrorUrl - Mirror URL
   */
  recordSuccess(mirrorUrl) {
    const state = this.mirrorState.get(mirrorUrl) || {
      health: MirrorHealth.UNKNOWN,
      failures: 0,
      lastCheck: null,
      lastSuccess: null
    };

    state.health = MirrorHealth.HEALTHY;
    state.failures = 0;
    state.lastCheck = Date.now();
    state.lastSuccess = Date.now();

    this.mirrorState.set(mirrorUrl, state);
  }

  /**
   * Record a failed fetch from a mirror
   * @param {string} mirrorUrl - Mirror URL
   * @param {Error} error - Error that occurred
   */
  recordFailure(mirrorUrl, error) {
    const state = this.mirrorState.get(mirrorUrl) || {
      health: MirrorHealth.UNKNOWN,
      failures: 0,
      lastCheck: null,
      lastSuccess: null
    };

    state.failures++;
    state.lastCheck = Date.now();

    if (state.failures >= this.config.maxFailures) {
      state.health = MirrorHealth.UNHEALTHY;
    } else if (state.failures > 0) {
      state.health = MirrorHealth.DEGRADED;
    }

    this.mirrorState.set(mirrorUrl, state);
    this.notifyHealthChange(null, { url: mirrorUrl }, state.health, error);
  }

  /**
   * Check if a mirror is healthy
   * @param {string} mirrorUrl - Mirror URL
   * @returns {boolean}
   */
  isHealthy(mirrorUrl) {
    const state = this.mirrorState.get(mirrorUrl);
    if (!state) return true;
    return state.health !== MirrorHealth.UNHEALTHY;
  }

  /**
   * Get health status of a mirror
   * @param {string} mirrorUrl - Mirror URL
   * @returns {string} Health status
   */
  getHealth(mirrorUrl) {
    const state = this.mirrorState.get(mirrorUrl);
    return state ? state.health : MirrorHealth.UNKNOWN;
  }

  /**
   * Get all mirror states
   * @returns {Map}
   */
  getAllStates() {
    return new Map(this.mirrorState);
  }

  /**
   * Reset mirror state (e.g., after recovery window)
   * @param {string} mirrorUrl - Mirror URL, or null for all
   */
  resetState(mirrorUrl = null) {
    if (mirrorUrl) {
      this.mirrorState.delete(mirrorUrl);
    } else {
      this.mirrorState.clear();
    }
  }

  /**
   * Add a health change listener
   * @param {Function} listener - Callback function
   */
  addListener(listener) {
    this.listeners.add(listener);
  }

  /**
   * Remove a health change listener
   * @param {Function} listener - Callback function
   */
  removeListener(listener) {
    this.listeners.delete(listener);
  }

  /**
   * Notify listeners of health change
   * @private
   */
  notifyHealthChange(listId, mirror, health, error = null) {
    const event = { listId, mirror, health, error, timestamp: Date.now() };
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (e) {
        console.error('[MirrorSelector] Listener error:', e);
      }
    });
  }

  /**
   * Perform health check on all mirrors for a list
   * @param {string} listId - List identifier
   * @param {Array} mirrors - Array of mirror objects
   * @returns {Promise<Array>} Results of health checks
   */
  async healthCheck(listId, mirrors) {
    const results = [];

    for (const mirror of mirrors) {
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(mirror.url, {
          method: 'HEAD',
          signal: controller.signal,
          headers: mirror.headers || { 'Accept': 'text/plain' }
        });

        clearTimeout(timeoutId);

        const latency = Date.now() - startTime;
        const success = response.ok;

        if (success) {
          this.recordSuccess(mirror.url);
        } else {
          this.recordFailure(mirror.url, new Error(`HTTP ${response.status}`));
        }

        results.push({ mirror: mirror.url, success, latency, status: response.status });
      } catch (error) {
        const latency = Date.now() - startTime;
        this.recordFailure(mirror.url, error);
        results.push({ mirror: mirror.url, success: false, latency, error: error.message });
      }
    }

    return results;
  }
}

/**
 * Integrity Checker - Optional SHA256 verification for critical lists
 */
class IntegrityChecker {
  constructor() {
    this.knownHashes = new Map(); // listId -> expected hash
    this.cache = new Map(); // url -> { hash, timestamp }
    this.cacheTTL = 86400000; // 24 hours
  }

  /**
   * Set expected hash for a list
   * @param {string} listId - List identifier
   * @param {string} hash - Expected SHA256 hash (hex)
   */
  setExpectedHash(listId, hash) {
    this.knownHashes.set(listId, hash.toLowerCase());
  }

  /**
   * Load known hashes from a manifest
   * @param {Object} manifest - { listId: hash, ... }
   */
  loadManifest(manifest) {
    for (const [listId, hash] of Object.entries(manifest)) {
      this.setExpectedHash(listId, hash);
    }
  }

  /**
   * Compute SHA256 hash of content
   * @param {string|ArrayBuffer} content - Content to hash
   * @returns {Promise<string>} Hex-encoded hash
   */
  async computeHash(content) {
    const buffer = typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content;

    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Verify content against expected hash
   * @param {string} listId - List identifier
   * @param {string|ArrayBuffer} content - Content to verify
   * @returns {Promise<{valid: boolean, computed: string, expected: string|null}>}
   */
  async verify(listId, content) {
    const expectedHash = this.knownHashes.get(listId);
    if (!expectedHash) {
      return { valid: true, computed: null, expected: null, reason: 'no_expected_hash' };
    }

    const computedHash = await this.computeHash(content);
    const valid = computedHash.toLowerCase() === expectedHash.toLowerCase();

    return {
      valid,
      computed: computedHash,
      expected: expectedHash,
      reason: valid ? 'match' : 'mismatch'
    };
  }

  /**
   * Verify content from a URL (with caching)
   * @param {string} url - Source URL
   * @param {string} content - Content to verify
   * @param {string} listId - List identifier
   * @returns {Promise<{valid: boolean, computed: string, expected: string|null, cached: boolean}>}
   */
  async verifyFromUrl(url, content, listId) {
    const cacheKey = `${listId}:${url}`;
    const cached = this.cache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
      const verification = await this.verify(listId, content);
      return { ...verification, cached: true };
    }

    const verification = await this.verify(listId, content);

    this.cache.set(cacheKey, {
      hash: verification.computed,
      timestamp: Date.now()
    });

    return { ...verification, cached: false };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

/**
 * Signature Validator - GPG/PGP signature verification for filter lists
 * Supports armored ASCII signatures (.asc) and binary signatures
 */
class SignatureValidator {
  constructor(config = {}) {
    this.config = { ...DEFAULT_SIGNATURE_CONFIG, ...config };
    this.keyCache = new Map(); // keyId -> { publicKey, algorithm, fetchedAt }
    this.verificationCache = new Map(); // url -> { status, details, timestamp }
    this.cacheTTL = 3600000; // 1 hour
  }

  /**
   * Import a PGP public key (armored or binary)
   * @param {string} armoredKey - ASCII-armored public key
   * @returns {Promise<CryptoKey>} Web Crypto API key
   */
  async importPublicKey(armoredKey) {
    // Strip armor headers/footers
    const base64 = armoredKey
      .replace(/-----BEGIN PGP PUBLIC KEY BLOCK-----/, '')
      .replace(/-----END PGP PUBLIC KEY BLOCK-----/, '')
      .replace(/\s/g, '');

    const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    // Parse PGP packet structure to extract RSA/ECDSA public key
    // This is a simplified parser - in production use openpgp.js
    return this._parsePGPPublicKey(binary);
  }

  /**
   * Parse PGP public key packet (simplified)
   * @private
   */
  async _parsePGPPublicKey(packetData) {
    // For production, use openpgp.js library
    // This is a placeholder that shows the structure
    // Real implementation would parse:
    // - Packet tag (0x99 for public key)
    // - Version (4 for RSA)
    // - Timestamp
    // - Algorithm (1=RSA, 18=ECDSA, 22=EdDSA)
    // - Key material (n, e for RSA; curve + point for ECC)

    throw new Error('PGP key parsing requires openpgp.js library. Install via: npm install openpgp');
  }

  /**
   * Fetch and cache public key from URL
   * @param {string} keyUrl - URL to fetch key from
   * @param {string} keyId - Key identifier
   * @returns {Promise<CryptoKey>}
   */
  async fetchPublicKey(keyUrl, keyId) {
    const cached = this.keyCache.get(keyId);
    if (cached && (Date.now() - cached.fetchedAt) < this.cacheTTL) {
      return cached.publicKey;
    }

    const response = await fetch(keyUrl, {
      headers: { 'Accept': 'application/pgp-keys, text/plain' }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch public key: HTTP ${response.status}`);
    }

    const armoredKey = await response.text();
    const publicKey = await this.importPublicKey(armoredKey);

    this.keyCache.set(keyId, { publicKey, algorithm: 'RSA-SHA256', fetchedAt: Date.now() });
    return publicKey;
  }

  /**
   * Fetch signature from URL
   * @param {string} signatureUrl - URL of .asc signature file
   * @returns {Promise<Uint8Array>} Binary signature
   */
  async fetchSignature(signatureUrl) {
    const response = await fetch(signatureUrl, {
      headers: { 'Accept': 'application/pgp-signature, text/plain' }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch signature: HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (contentType.includes('application/pgp-signature') || text.includes('-----BEGIN PGP SIGNATURE-----')) {
      // Parse armored signature
      return this._parseArmoredSignature(text);
    }

    // Assume binary
    return new TextEncoder().encode(text);
  }

  /**
   * Parse ASCII-armored signature
   * @private
   */
  _parseArmoredSignature(armored) {
    const base64 = armored
      .replace(/-----BEGIN PGP SIGNATURE-----/, '')
      .replace(/-----END PGP SIGNATURE-----/, '')
      .replace(/\s/g, '');

    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  }

  /**
   * Verify content against signature using public key
   * @param {string|ArrayBuffer} content - Content to verify
   * @param {Uint8Array} signature - Binary signature
   * @param {CryptoKey} publicKey - Public key
   * @param {string} algorithm - Algorithm identifier
   * @returns {Promise<{valid: boolean, algorithm: string, details: string}>}
   */
  async verifySignature(content, signature, publicKey, algorithm = 'RSA-SHA256') {
    const buffer = typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content;

    try {
      let cryptoAlgorithm;
      switch (algorithm) {
        case 'RSA-SHA256':
        case 'RSA-SHA512':
          cryptoAlgorithm = { name: 'RSASSA-PKCS1-v1_5', hash: algorithm.includes('512') ? 'SHA-512' : 'SHA-256' };
          break;
        case 'ECDSA-SHA256':
          cryptoAlgorithm = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
          break;
        case 'ED25519':
          cryptoAlgorithm = { name: 'Ed25519' };
          break;
        default:
          throw new Error(`Unsupported algorithm: ${algorithm}`);
      }

      const valid = await crypto.subtle.verify(cryptoAlgorithm, publicKey, signature, buffer);

      return {
        valid,
        algorithm,
        details: valid ? 'Signature verified successfully' : 'Signature verification failed'
      };
    } catch (error) {
      return {
        valid: false,
        algorithm,
        details: `Verification error: ${error.message}`
      };
    }
  }

  /**
   * Verify a list source's signature
   * @param {Object} source - List source object with signature config
   * @param {string|ArrayBuffer} content - List content
   * @param {Object} options - Verification options
   * @returns {Promise<{status: string, valid: boolean, details: string, verifiedAt: number}>}
   */
  async verifySource(source, content, options = {}) {
    const { forceRefresh = false } = options;
    const listId = source.id;

    if (!source.signature || !source.signature.enabled) {
      return {
        status: SignatureStatus.NOT_VERIFIED,
        valid: false,
        details: 'Signature verification not enabled for this source',
        verifiedAt: Date.now()
      };
    }

    const cacheKey = `${listId}:content`;
    const cached = this.verificationCache.get(cacheKey);
    if (cached && !forceRefresh && (Date.now() - cached.verifiedAt) < this.cacheTTL) {
      return cached;
    }

    try {
      // Fetch public key
      const keyId = source.signature.keyId;
      const keyUrl = source.signature.keyUrl;

      let publicKey;
      if (keyUrl) {
        publicKey = await this.fetchPublicKey(keyUrl, keyId);
      } else {
        // Try to get from trusted keys
        const trustedKey = this.config.trustedKeys.get(keyId);
        if (!trustedKey) {
          return {
            status: SignatureStatus.ERROR,
            valid: false,
            details: `No public key available for ${keyId}`,
            verifiedAt: Date.now()
          };
        }
        publicKey = trustedKey;
      }

      // Try primary signature URL first, then mirrors
      const sigUrls = [source.signature.primaryUrl, ...(source.signature.mirrorUrls || [])];
      let lastError = null;

      for (const sigUrl of sigUrls) {
        try {
          const signature = await this.fetchSignature(sigUrl);
          const result = await this.verifySignature(
            content,
            signature,
            publicKey,
            source.signature.algorithm
          );

          const verificationResult = {
            status: result.valid ? SignatureStatus.VALID : SignatureStatus.INVALID,
            valid: result.valid,
            details: result.details,
            verifiedAt: Date.now(),
            signatureUrl: sigUrl,
            keyId
          };

          this.verificationCache.set(cacheKey, verificationResult);
          return verificationResult;
        } catch (error) {
          lastError = error;
          continue; // Try next mirror
        }
      }

      // All signature sources failed
      return {
        status: SignatureStatus.ERROR,
        valid: false,
        details: `Failed to fetch/verify signature from all sources: ${lastError?.message}`,
        verifiedAt: Date.now()
      };
    } catch (error) {
      return {
        status: SignatureStatus.ERROR,
        valid: false,
        details: `Signature verification failed: ${error.message}`,
        verifiedAt: Date.now()
      };
    }
  }

  /**
   * Verify content with both integrity (hash) and signature
   * @param {Object} source - List source
   * @param {string|ArrayBuffer} content - Content to verify
   * @param {IntegrityChecker} integrityChecker - Integrity checker instance
   * @returns {Promise<{integrity: Object, signature: Object, overallValid: boolean}>}
   */
  async verifyComplete(source, content, integrityChecker) {
    const integrityResult = await integrityChecker.verify(source.id, content);
    const signatureResult = await this.verifySource(source, content);

    const overallValid = integrityResult.valid && (!source.signature?.requireValidSignature || signatureResult.valid);

    return {
      integrity: integrityResult,
      signature: signatureResult,
      overallValid,
      verifiedAt: Date.now()
    };
  }

  /**
   * Add a trusted key
   * @param {string} keyId - Key identifier
   * @param {CryptoKey} publicKey - Public key
   * @param {string} algorithm - Algorithm
   */
  addTrustedKey(keyId, publicKey, algorithm = 'RSA-SHA256') {
    this.config.trustedKeys.set(keyId, publicKey);
    this.keyCache.set(keyId, { publicKey, algorithm, fetchedAt: Date.now() });
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.keyCache.clear();
    this.verificationCache.clear();
  }

  /**
   * Get verification status for a source
   * @param {string} listId - List identifier
   * @returns {Object|null} Cached verification result or null
   */
  getVerificationStatus(listId) {
    return this.verificationCache.get(`${listId}:content`) || null;
  }
}

/**
 * Get mirror URL for a list source with automatic fallback
 * @param {string} listId - List identifier from LIST_SOURCES
 * @param {Object} options - Selection options
 * @param {boolean} options.preferPrimary - Try primary first (default: true)
 * @param {string} options.region - Preferred region (default: 'global')
 * @param {MirrorSelector} options.selector - Custom mirror selector instance
 * @returns {Object|null} Selected mirror info or null if list not found
 */
function getMirrorUrl(listId, options = {}) {
  const {
    preferPrimary = true,
    region = 'global',
    selector = defaultSelector
  } = options;

  const source = LIST_SOURCES.get(listId);
  if (!source) {
    console.warn(`[ListSources] Unknown list ID: ${listId}`);
    return null;
  }

  if (!source.enabled) {
    console.warn(`[ListSources] List disabled: ${listId}`);
    return null;
  }

  // Try primary first if preferred
  if (preferPrimary && source.primary) {
    const primaryHealth = selector.getHealth(source.primary.url);
    if (primaryHealth !== MirrorHealth.UNHEALTHY) {
      return {
        url: source.primary.url,
        headers: source.primary.headers,
        isPrimary: true,
        mirrorName: 'primary',
        source
      };
    }
  }

  // Fall back to mirrors
  const mirrors = source.mirrors || [];
  const selectedMirror = selector.getMirror(listId, mirrors);

  if (!selectedMirror) {
    // Last resort: primary even if unhealthy
    if (source.primary) {
      return {
        url: source.primary.url,
        headers: source.primary.headers,
        isPrimary: true,
        mirrorName: 'primary (fallback)',
        source
      };
    }
    return null;
  }

  return {
    url: selectedMirror.url,
    headers: selectedMirror.headers || { 'Accept': 'text/plain' },
    isPrimary: false,
    mirrorName: selectedMirror.name,
    mirrorPriority: selectedMirror.priority,
    source
  };
}

/**
 * Get all available URLs for a list (primary + mirrors)
 * @param {string} listId - List identifier
 * @returns {Array<Object>} Array of {url, name, isPrimary, priority}
 */
function getAllUrls(listId) {
  const source = LIST_SOURCES.get(listId);
  if (!source) return [];

  const urls = [];

  if (source.primary) {
    urls.push({
      url: source.primary.url,
      name: 'Primary',
      isPrimary: true,
      priority: 0
    });
  }

  for (const mirror of source.mirrors || []) {
    urls.push({
      url: mirror.url,
      name: mirror.name,
      isPrimary: false,
      priority: mirror.priority
    });
  }

  return urls.sort((a, b) => a.priority - b.priority);
}

/**
 * Get regional variant URL
 * @param {string} listId - Base list ID (e.g., 'easylist')
 * @param {string} region - Region code (e.g., 'germany', 'china')
 * @returns {Object|null} Regional variant info
 */
function getRegionalVariant(listId, region) {
  const source = LIST_SOURCES.get(listId);
  if (!source || !source.regionalVariants) return null;

  const variantUrl = source.regionalVariants[`${listId}-${region}`] ||
                     source.regionalVariants[region];

  if (!variantUrl) return null;

  return {
    url: variantUrl,
    region,
    listId: `${listId}-${region}`
  };
}

/**
 * Get all regional lists
 * @returns {Object} Regional lists by country code
 */
function getRegionalLists() {
  const regionalSource = LIST_SOURCES.get('regional');
  return regionalSource ? regionalSource.regionalLists : {};
}

/**
 * Validate a custom list URL
 * @param {string} url - URL to validate
 * @returns {Object} Validation result {valid: boolean, errors: string[]}
 */
function validateCustomUrl(url) {
  const errors = [];
  const customSource = LIST_SOURCES.get('custom');
  const validation = customSource.validation;

  try {
    const parsed = new URL(url);

    if (validation.requireHttps && parsed.protocol !== 'https:') {
      errors.push('URL must use HTTPS');
    }

    const hostname = parsed.hostname.toLowerCase();
    const allowed = validation.allowedDomains.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );

    if (!allowed) {
      errors.push(`Domain not in allowed list: ${hostname}`);
    }
  } catch (e) {
    errors.push('Invalid URL format');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Add a custom list
 * @param {string} id - Unique identifier
 * @param {string} name - Display name
 * @param {string} url - List URL
 * @param {Object} options - Additional options
 * @returns {Object} Added list info
 */
function addCustomList(id, name, url, options = {}) {
  const validation = validateCustomUrl(url);
  if (!validation.valid) {
    throw new Error(`Invalid custom list URL: ${validation.errors.join(', ')}`);
  }

  const customSource = LIST_SOURCES.get('custom');
  const listId = `custom-${id}`;

  const listInfo = {
    id: listId,
    name,
    description: options.description || 'Custom user list',
    category: 'custom',
    maintainer: 'User',
    primary: {
      url,
      mirror: '',
      headers: { 'Accept': 'text/plain' }
    },
    mirrors: options.mirrors || [],
    integrity: {
      algorithm: 'sha256',
      expectedHash: options.expectedHash || null,
      verifyOnFetch: options.verifyIntegrity || false
    },
    updateFrequency: options.updateFrequency || 86400000,
    lastModified: null,
    etag: null,
    enabled: true,
    critical: false,
    isCustom: true,
    addedAt: Date.now()
  };

  // Store in a custom lists map (separate from main LIST_SOURCES)
  if (!globalThis.__AEROGUARD_CUSTOM_LISTS) {
    globalThis.__AEROGUARD_CUSTOM_LISTS = new Map();
  }
  globalThis.__AEROGUARD_CUSTOM_LISTS.set(listId, listInfo);

  return listInfo;
}

/**
 * Remove a custom list
 * @param {string} id - List identifier
 * @returns {boolean} True if removed
 */
function removeCustomList(id) {
  const listId = id.startsWith('custom-') ? id : `custom-${id}`;
  if (globalThis.__AEROGUARD_CUSTOM_LISTS) {
    return globalThis.__AEROGUARD_CUSTOM_LISTS.delete(listId);
  }
  return false;
}

/**
 * Get all custom lists
 * @returns {Array} Custom lists
 */
function getCustomLists() {
  if (!globalThis.__AEROGUARD_CUSTOM_LISTS) return [];
  return Array.from(globalThis.__AEROGUARD_CUSTOM_LISTS.values());
}

/**
 * Get list source by ID
 * @param {string} listId - List identifier
 * @returns {Object|null} List source or null
 */
function getListSource(listId) {
  // Check main sources first
  let source = LIST_SOURCES.get(listId);
  if (source) return source;

  // Check custom lists
  if (globalThis.__AEROGUARD_CUSTOM_LISTS) {
    source = globalThis.__AEROGUARD_CUSTOM_LISTS.get(listId);
    if (source) return source;
  }

  return null;
}

/**
 * Get all enabled list sources
 * @returns {Array} Enabled list sources
 */
function getEnabledSources() {
  const sources = [];

  for (const source of LIST_SOURCES.values()) {
    if (source.enabled) {
      sources.push(source);
    }
  }

  // Add custom lists
  if (globalThis.__AEROGUARD_CUSTOM_LISTS) {
    for (const source of globalThis.__AEROGUARD_CUSTOM_LISTS.values()) {
      if (source.enabled) {
        sources.push(source);
      }
    }
  }

  return sources;
}

/**
 * Get critical list sources (required for basic functionality)
 * @returns {Array} Critical list sources
 */
function getCriticalSources() {
  return getEnabledSources().filter(source => source.critical);
}

/**
 * Export all sources as plain object (for serialization)
 * @returns {Object}
 */
function exportSources() {
  const result = {};

  for (const [id, source] of LIST_SOURCES) {
    result[id] = { ...source };
  }

  if (globalThis.__AEROGUARD_CUSTOM_LISTS) {
    for (const [id, source] of globalThis.__AEROGUARD_CUSTOM_LISTS) {
      result[id] = { ...source };
    }
  }

  return result;
}

// Create default mirror selector instance
const defaultSelector = new MirrorSelector();

// Create default integrity checker instance
const defaultIntegrityChecker = new IntegrityChecker();

// Create default signature validator instance
const defaultSignatureValidator = new SignatureValidator();

// Export all public API
module.exports = {
  // Constants
  MirrorHealth,
  SignatureStatus,
  DEFAULT_HEALTH_CONFIG,
  DEFAULT_SIGNATURE_CONFIG,

  // Main registry
  LIST_SOURCES,

  // Classes
  MirrorSelector,
  IntegrityChecker,
  SignatureValidator,

  // Default instances
  defaultSelector,
  defaultIntegrityChecker,
  defaultSignatureValidator,

  // Helper functions
  getMirrorUrl,
  getAllUrls,
  getRegionalVariant,
  getRegionalLists,
  validateCustomUrl,
  addCustomList,
  removeCustomList,
  getCustomLists,
  getListSource,
  getEnabledSources,
  getCriticalSources,
  exportSources
};

// Also support ES module default export
module.exports.default = module.exports;