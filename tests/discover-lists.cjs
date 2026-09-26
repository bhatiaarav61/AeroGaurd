// Full AdGuard index dump + GitHub repo content discovery
(async () => {
  const raw = await (await fetch('https://filters.adtidy.org/extension/ublock/filters.json', { signal: AbortSignal.timeout(20000) })).json();
  const idx = Array.isArray(raw) ? raw : (raw.filters || raw.lists || Object.values(raw));
  console.log('top-level:', Array.isArray(raw) ? 'array' : Object.keys(raw).slice(0, 8).join(','));
  console.log('=== ADGUARD FILTERS ===');
  for (const f of idx) {
    console.log(String(f.id).padStart(3), (f.name || '').slice(0, 45).padEnd(45), JSON.stringify(f.language || []), (f.description || '').slice(0, 60));
  }
  console.log('\n=== GITHUB REPO CONTENTS ===');
  const repos = ['DandelionSprout/nordicfilters', 'hufilter/hufilter', 'AdBlockPlusIsrael/EasyListHebrew', 'LatvianList/adblock-latvian', 'LithuanianList/adblock-lithuanian', 'mrgordian/turkish-adblock-list'];
  for (const r of repos) {
    try {
      const res = await fetch(`https://api.github.com/repos/${r}/contents/`, {
        headers: { 'user-agent': 'AeroGuard-Build', accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) { console.log(r, '->', res.status); continue; }
      const files = (await res.json()).filter(f => f.type === 'file' && /\.txt$/i.test(f.name)).map(f => f.name);
      console.log(r, '->', files.join(', ').slice(0, 300));
    } catch (e) { console.log(r, 'ERR', e.message.slice(0, 40)); }
  }
})();
