// Round 2: alternates for dead regional URLs
const urls = {
  israel_1: 'https://raw.githubusercontent.com/AdBlockPlusIsrael/EasyListHebrew/master/EasyListHebrew.txt',
  israel_2: 'https://easylist-downloads.adblockplus.org/easylist_hebrew.txt',
  hungary_1: 'https://raw.githubusercontent.com/hufilter/hufilter/master/hufilter.txt',
  hungary_2: 'https://raw.githubusercontent.com/hufilter/hufilter/master/hufilter-dnr.txt',
  latvia_1: 'https://raw.githubusercontent.com/LatvianList/adblock-latvian/main/adblock-latvian.txt',
  lithuania_1: 'https://raw.githubusercontent.com/LithuanianList/adblock-lithuanian/main/adblock-lithuanian.txt',
  turkey_1: 'https://raw.githubusercontent.com/mrgordian/turkish-adblock-list/main/turkish-adblock.txt',
  turkey_2: 'https://filters.adtidy.org/extension/ublock/filters/36.txt',
  nordic_1: 'https://raw.githubusercontent.com/DandelionSprout/nordicfilters/master/Nordic%20filters%20ABP.txt',
  nordic_2: 'https://raw.githubusercontent.com/DandelionSprout/nordicfilters/main/NordicFiltersABP.txt',
  nordic_3: 'https://cdn.statically.io/gh/DandelionSprout/nordicfilters/master/NordicFiltersABP.txt',
  romania_1: 'https://raw.githubusercontent.com/zbug/rolist/master/rolist.txt',
  romania_2: 'https://filters.adtidy.org/extension/ublock/filters/22.txt',
  serbia_1: 'https://raw.githubusercontent.com/EsadCetiner?fallback=x/x',
  adguard_index: 'https://filters.adtidy.org/extension/ublock/filters.json',
  adguard_meta: 'https://api.adtidy.org/api/v1/filters/list/metadata.json'
};

(async () => {
  for (const [name, url] of Object.entries(urls)) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!res.ok) { console.log(`${name.padEnd(16)} HTTP ${res.status}`); continue; }
      const text = await res.text();
      let meta = '';
      if (url.includes('json')) {
        try {
          const j = JSON.parse(text);
          const lists = Array.isArray(j) ? j : (j.filters || j.lists || []);
          meta = JSON.stringify(lists.slice(0, 60).map(f => ({ id: f.id ?? f.filter_id, n: (f.name || f.title || '').slice(0, 30), lang: f.language || f.languages || '' })));
        } catch { meta = 'json-parse-fail'; }
      } else {
        const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('!') && !l.startsWith('[')).length;
        meta = `~${lines} lines`;
      }
      console.log(`${name.padEnd(16)} OK ${(text.length / 1024).toFixed(0).padStart(6)}KB ${meta.slice(0, 700)}`);
    } catch (e) {
      console.log(`${name.padEnd(16)} FAIL ${e.message.slice(0, 50)}`);
    }
  }
})();
