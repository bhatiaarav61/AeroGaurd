// Verify regional filter list URLs are alive and look like filter lists
const urls = {
  easylist_germany: 'https://easylist.to/easylistgermany/easylistgermany.txt',
  easylist_france: 'https://easylist-downloads.adblockplus.org/liste_fr.txt',
  easylist_italy: 'https://easylist-downloads.adblockplus.org/easylistitaly.txt',
  easylist_china: 'https://easylist-downloads.adblockplus.org/easylistchina.txt',
  easylist_poland: 'https://easylist-downloads.adblockplus.org/easylistpolish.txt',
  easylist_spanish: 'https://easylist-downloads.adblockplus.org/easylistspanish.txt',
  easylist_netherlands: 'https://easylist-downloads.adblockplus.org/easylistdutch.txt',
  easylist_czech: 'https://easylist-downloads.adblockplus.org/easylistczechslovak.txt',
  easylist_israel: 'https://easylist-downloads.adblockplus.org/israelilist.txt',
  easylist_bulgaria: 'https://stanev.org/abp/adblock_bg.txt',
  easylist_hungary: 'https://raw.githubusercontent.com/szpeter80/hufilter/master/hufilter.txt',
  easylist_greece: 'https://www.void.gr/kargig/void-gr-filters.txt',
  easylist_latvia: 'https://raw.githubusercontent.com/LatvianList/adblock-latvian/master/adblock-latvian.txt',
  easylist_lithuania: 'https://raw.githubusercontent.com/LithuanianList/adblock-lithuanian/master/adblock-lithuanian.txt',
  easylist_turkey: 'https://raw.githubusercontent.com/mrgordian/turkish-adblock-list/master/turkish-adblock.txt',
  easylist_denmark: 'https://raw.githubusercontent.com/DandelionSprout/nordicfilters/master/NordicFiltersABP.txt',
  easylist_russia: 'https://easylist-downloads.adblockplus.org/ruadlist.txt',
  easylist_romania: 'https://raw.githubusercontent.com/DandelionSprout/adfilt/master/RomanianAdList/RomanianAdFilterList.txt',
  easylist_serbia: 'https://raw.githubusercontent.com/jerryn70/GoodbyeAds/master/GoodbyeAds-Serbian-AdBlock-List.txt',
  oisd: 'https://abp.oisd.nl/'
};

(async () => {
  for (const [name, url] of Object.entries(urls)) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (!res.ok) { console.log(`${name.padEnd(22)} HTTP ${res.status}  ${url}`); continue; }
      const text = await res.text();
      const first = text.split(/\r?\n/).find(l => l.trim() && !l.startsWith('[')) || text.split(/\r?\n/)[0];
      const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('!') && !l.startsWith('[')).length;
      console.log(`${name.padEnd(22)} OK ${(text.length / 1024).toFixed(0).padStart(6)}KB ~${String(lines).padStart(6)} lines | ${first.slice(0, 70)}`);
    } catch (e) {
      console.log(`${name.padEnd(22)} FAIL ${e.message.slice(0, 60)}  ${url}`);
    }
  }
})();
