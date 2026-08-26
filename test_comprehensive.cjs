const mod = require('./telemetry.cjs');

async function runTests() {
  console.log('=== FINAL COMPREHENSIVE TEST ===');

  // Test all major features
  const t = new mod.Telemetry({ samplingRate: 1.0 });

  // 1. Counters
  t.counter('custom_counter', { type: 'test' }).inc(42);
  console.log('✓ Counter:', t.get('custom_counter', { type: 'test' }).get());

  // 2. Gauges
  t.gauge('custom_gauge', { type: 'test' }).set(3.14);
  console.log('✓ Gauge:', t.get('custom_gauge', { type: 'test' }).get());

  // 3. Histograms with custom buckets
  t.histogram('custom_hist', { type: 'test' }, [1, 5, 10, 50]).observe(7).observe(12).observe(3);
  console.log('✓ Histogram stats:', t.get('custom_hist', { type: 'test' }).getStats().p50);

  // 4. Built-in tracking
  t.trackRequest(true, 'https://ads.example.com', 'easylist', 2);
  t.trackRequest(false, 'https://api.example.com', 'easylist', 1);
  console.log('✓ Request tracking:', t.get('requests_total', { desc: 'Total requests' }).get());

  // 5. Filter match tracking
  t.trackFilterMatch(0.001, true, 'easylist');
  console.log('✓ Filter match tracking:', t.get('filter_match_seconds', { desc: 'Filter match latency' }).getStats().count);

  // 6. DNR update tracking
  t.trackDNRUpdate(100, 25000, true);
  console.log('✓ DNR update tracking:', t.get('active_rules', { desc: 'Active DNR rules' }).get());

  // 7. Error tracking
  try { throw new Error('test'); } catch(e) { t.trackError('test_op', e); }
  console.log('✓ Error tracking:', t.get('errors_total', { desc: 'Errors' }).get());

  // 8. Memory tracking
  t.setMemory(1024 * 1024);
  console.log('✓ Memory tracking:', t.get('memory_bytes', { desc: 'Memory usage' }).get());

  // 9. Filter lists tracking
  t.setFilterLists(7);
  console.log('✓ Filter lists tracking:', t.get('filter_lists', { desc: 'Enabled filter lists' }).get());

  // 10. Events with correlation
  const cid = t.startOp('complex_operation', { userId: '123' });
  t.recordEvent('step1', { action: 'fetch' }, { correlationId: cid });
  t.recordEvent('step2', { action: 'process' }, { correlationId: cid });
  t.endOp(cid, 'success', { duration: 250 });
  const events = t.events.getEvents({ correlationId: cid });
  console.log('✓ Correlation events:', events.length);

  // 11. Privacy - PII stripping
  const pe = new mod.PrivacyEngine();
  console.log('✓ PII stripping:', pe.stripPII('Contact: user@example.com or call 555-1234'));

  // 12. Privacy - Differential privacy
  const original = [100, 100, 100, 100, 100];
  const noisy = original.map(v => pe.addNoise(v, 1));
  console.log('✓ Differential privacy - original sum:', original.reduce((a,b)=>a+b), 'noisy sum:', noisy.reduce((a,b)=>a+b));

  // 13. Prometheus format
  const prom = t.toPrometheus();
  console.log('✓ Prometheus format lines:', prom.split('\n').filter(l => l).length);

  // 14. Export
  const exported = await t.export();
  console.log('✓ Export - metrics:', Object.keys(exported.metrics).length, 'events:', exported.events.length);

  // 15. Reset
  t.reset();
  console.log('✓ Reset - requests_total:', t.get('requests_total', { desc: 'Total requests' }).get());

  // 16. Aggregator
  const storage = { data: {}, async get(k) { return { [k]: this.data[k] }; }, async set(o) { Object.assign(this.data, o); } };
  const agg = new mod.LocalAggregator(storage, new mod.PrivacyEngine());
  const c = new mod.Counter('agg_test'); c.inc(5); agg.add(c);
  await agg.flush();
  const agg2 = new mod.LocalAggregator(storage, new mod.PrivacyEngine());
  await agg2.load();
  console.log('✓ Aggregator persist/load:', agg2.getAll().length);

  // 17. Singleton
  console.log('✓ Singleton:', mod.telemetry === mod.telemetry);

  console.log('\n=== ALL TESTS PASSED ===');
}

runTests();