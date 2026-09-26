(async () => {
  const raw = await (await fetch('https://filters.adtidy.org/extension/ublock/filters.json', { signal: AbortSignal.timeout(20000) })).json();
  console.log('sample entry keys:', Object.keys(raw.filters[0]).join(','));
  console.log('sample entry:', JSON.stringify(raw.filters[0]).slice(0, 600));
  console.log('\n=== id | name | lang | url ===');
  for (const f of raw.filters) {
    const id = f.filter_id ?? f.id ?? f.filterId ?? f.number;
    console.log(String(id).padStart(3), (f.name || '').slice(0, 42).padEnd(42), JSON.stringify(f.language || []).slice(0, 40).padEnd(40), (f.url || f.subscriptionUrl || '').slice(0, 90));
  }
})();
