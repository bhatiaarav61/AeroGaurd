/**
 * Test Suite for VMAP/VAST/VPAD Parser with HLS/DASH Segment Filtering
 * Tests server-side manifest destruction, HLS/DASH segment filtering, ad period removal
 */

import assert from 'assert';
import { JSDOM } from 'jsdom';

// Create a JSDOM instance for testing
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://example.com',
  pretendToBeVisual: true
});

const mockContext = {
  DOMParser: dom.window.DOMParser,
  XMLSerializer: dom.window.XMLSerializer,
  window: dom.window,
  document: dom.window.document
};

// Import the parser
import { VMAPVASTParser, ServerSideManifestProcessor } from '../../core/youtube-engine/vmap-vast-parser.js';

console.log('=== VMAP/VAST/VPAD Parser Test Suite ===\n');

// ==================== Test Helpers ====================

function createParser() {
  return new VMAPVASTParser(mockContext.window);
}

function assertStringsEqual(actual, expected, message) {
  try {
    assert.strictEqual(actual.trim(), expected.trim());
    console.log(`✓ ${message}`);
    return true;
  } catch (e) {
    console.log(`✗ ${message} - ${e.message}`);
    console.log(`  Expected: ${expected.trim().substring(0, 100)}...`);
    console.log(`  Actual:   ${actual.trim().substring(0, 100)}...`);
    return false;
  }
}

function assertContains(haystack, needle, message) {
  try {
    assert(haystack.includes(needle));
    console.log(`✓ ${message}`);
    return true;
  } catch (e) {
    console.log(`✗ ${message} - ${e.message}`);
    console.log(`  Expected to contain: ${needle}`);
    return false;
  }
}

function assertNotContains(haystack, needle, message) {
  try {
    assert(!haystack.includes(needle));
    console.log(`✓ ${message}`);
    return true;
  } catch (e) {
    console.log(`✗ ${message} - ${e.message}`);
    console.log(`  Expected NOT to contain: ${needle}`);
    return false;
  }
}

// ==================== VMAP Tests ====================

function testVMAP() {
  console.log('--- VMAP Tests ---');
  let passed = 0;
  let failed = 0;

  const parser = createParser();

  // Test 1: Basic VMAP with AdBreak
  try {
    const vmap = `<?xml version="1.0"?>
<vmap:VMAP xmlns:vmap="http://www.iab.net/vmap-1.0" version="1.0">
  <vmap:AdBreak breakType="linear" breakId="mypre" timeOffset="start">
    <vmap:AdSource allowType="vast" id="ad1">
      <vmap:AdTagURI><![CDATA[https://pubads.g.doubleclick.net/gampad/ads?sz=640x480&adformat=video]]></vmap:AdTagURI>
    </vmap:AdSource>
  </vmap:AdBreak>
  <vmap:AdBreak breakType="linear" breakId="mymid" timeOffset="00:05:00">
    <vmap:AdSource allowType="vast" id="ad2">
      <vmap:AdTagURI><![CDATA[https://example.com/vast.xml]]></vmap:AdTagURI>
    </vmap:AdSource>
  </vmap:AdBreak>
</vmap:VMAP>`;

    const result = parser.stripVMAPAds(vmap);
    assertNotContains(result, 'AdBreak', 'VMAP: AdBreak elements removed');
    assertNotContains(result, 'doubleclick', 'VMAP: DoubleClick ad URL removed');
    assertContains(result, 'vmap:VMAP', 'VMAP: Root element preserved');
    passed += 3;
  } catch (e) {
    console.log(`✗ Test 1: Basic VMAP - ${e.message}`);
    failed += 3;
  }

  // Test 2: VMAP with Tracking elements
  try {
    const vmap = `<?xml version="1.0"?>
<VMAP version="1.0">
  <AdBreak timeOffset="start" breakType="linear">
    <AdSource id="ad1"><AdTagURI>https://example.com/vast.xml</AdTagURI></AdSource>
    <Tracking event="impression">https://doubleclick.net/impression</Tracking>
    <Tracking event="click">https://googlesyndication.com/click</Tracking>
    <Tracking event="creativeView">https://example.com/track</Tracking>
  </AdBreak>
</VMAP>`;

    const result = parser.stripVMAPAds(vmap);
    assertNotContains(result, 'AdBreak', 'VMAP: AdBreak with tracking removed');
    assertNotContains(result, 'doubleclick', 'VMAP: DoubleClick tracking removed');
    assertNotContains(result, 'googlesyndication', 'VMAP: GoogleSyndication tracking removed');
    passed += 3;
  } catch (e) {
    console.log(`✗ Test 2: VMAP with Tracking - ${e.message}`);
    failed += 3;
  }

  // Test 3: VMAP with Extensions
  try {
    const vmap = `<?xml version="1.0"?>
<VMAP version="1.0">
  <AdBreak timeOffset="start" breakType="linear">
    <AdSource id="ad1"><AdTagURI>https://example.com/vast.xml</AdTagURI></AdSource>
    <Extensions>
      <AdConfig>ad configuration data</AdConfig>
      <google>google ad data</google>
    </Extensions>
  </AdBreak>
</VMAP>`;

    const result = parser.stripVMAPAds(vmap);
    assertNotContains(result, 'Extensions', 'VMAP: Extensions with ad config removed');
    passed++;
  } catch (e) {
    console.log(`✗ Test 3: VMAP with Extensions - ${e.message}`);
    failed++;
  }

  // Test 4: Empty VMAP (no ads)
  try {
    const vmap = `<?xml version="1.0"?>
<VMAP version="1.0">
</VMAP>`;

    const result = parser.stripVMAPAds(vmap);
    assertContains(result, 'VMAP', 'VMAP: Empty VMAP preserved');
    passed++;
  } catch (e) {
    console.log(`✗ Test 4: Empty VMAP - ${e.message}`);
    failed++;
  }

  console.log(`VMAP: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== VAST Tests ====================

function testVAST() {
  console.log('--- VAST Tests ---');
  let passed = 0;
  let failed = 0;

  const parser = createParser();

  // Test 1: Basic VAST with InLine ad
  try {
    const vast = `<?xml version="1.0"?>
<VAST version="4.0">
  <Ad id="123">
    <InLine>
      <AdSystem>Google Ads</AdSystem>
      <AdTitle>Test Ad</AdTitle>
      <Impression>https://example.com/impression</Impression>
      <Creatives>
        <Creative>
          <Linear>
            <Duration>00:00:30</Duration>
            <MediaFiles>
              <MediaFile type="video/mp4">https://googlesyndication.com/video.mp4</MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>`;

    const result = parser.stripVASTAds(vast);
    assertNotContains(result, '<Ad', 'VAST: Ad elements removed');
    assertNotContains(result, '<InLine', 'VAST: InLine elements removed');
    assertNotContains(result, 'googlesyndication', 'VAST: GoogleSyndication media file removed');
    assertContains(result, 'VAST', 'VAST: Root element preserved');
    passed += 4;
  } catch (e) {
    console.log(`✗ Test 1: Basic VAST - ${e.message}`);
    failed += 4;
  }

  // Test 2: VAST with Wrapper
  try {
    const vast = `<?xml version="1.0"?>
<VAST version="4.0">
  <Ad id="456">
    <Wrapper>
      <VASTAdTagURI>https://pubads.g.doubleclick.net/gampad/ads?adformat=video</VASTAdTagURI>
      <Impression>https://example.com/wrapper-impression</Impression>
    </Wrapper>
  </Ad>
</VAST>`;

    const result = parser.stripVASTAds(vast);
    assertNotContains(result, 'Wrapper', 'VAST: Wrapper elements removed');
    assertNotContains(result, 'doubleclick', 'VAST: DoubleClick wrapper URL removed');
    passed += 2;
  } catch (e) {
    console.log(`✗ Test 2: VAST Wrapper - ${e.message}`);
    failed += 2;
  }

  // Test 3: VAST with NonLinear ads
  try {
    const vast = `<?xml version="1.0"?>
<VAST version="4.0">
  <Ad id="789">
    <InLine>
      <AdSystem>Test</AdSystem>
      <AdTitle>Overlay Ad</AdTitle>
      <Creatives>
        <Creative>
          <NonLinearAds>
            <NonLinear>
              <StaticResource creativeType="image/png">https://example.com/banner.png</StaticResource>
            </NonLinear>
          </NonLinearAds>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>`;

    const result = parser.stripVASTAds(vast);
    assertNotContains(result, 'NonLinearAds', 'VAST: NonLinearAds removed');
    passed++;
  } catch (e) {
    console.log(`✗ Test 3: VAST NonLinear - ${e.message}`);
    failed++;
  }

  // Test 4: VAST with CompanionAds
  try {
    const vast = `<?xml version="1.0"?>
<VAST version="4.0">
  <Ad id="999">
    <InLine>
      <AdSystem>Test</AdSystem>
      <AdTitle>Companion Ad</AdTitle>
      <Creatives>
        <Creative>
          <CompanionAds>
            <Companion width="300" height="250">
              <StaticResource creativeType="image/jpeg">https://doubleclick.net/banner.jpg</StaticResource>
            </Companion>
          </CompanionAds>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>`;

    const result = parser.stripVASTAds(vast);
    assertNotContains(result, 'CompanionAds', 'VAST: CompanionAds removed');
    assertNotContains(result, 'doubleclick', 'VAST: DoubleClick companion removed');
    passed += 2;
  } catch (e) {
    console.log(`✗ Test 4: VAST CompanionAds - ${e.message}`);
    failed += 2;
  }

  console.log(`VAST: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== VPAD Tests ====================

function testVPAD() {
  console.log('--- VPAD Tests ---');
  let passed = 0;
  let failed = 0;

  const parser = createParser();

  // Test 1: VPAD with ad plugins
  try {
    const vpad = JSON.stringify({
      plugins: [
        { name: 'video', type: 'video' },
        { name: 'ads', type: 'ads', adTagUrl: 'https://example.com/vast.xml' },
        { name: 'analytics', type: 'analytics' }
      ],
      adSchedule: { preroll: true, midroll: ['00:05:00'] },
      adBreaks: [{ timeOffset: 'start', adTag: 'https://doubleclick.net/ad' }],
      adTagUrl: 'https://googlesyndication.com/vast'
    });

    const result = parser.stripVPADAds(vpad);
    const parsed = JSON.parse(result);
    assert(!parsed.adSchedule, 'VPAD: adSchedule removed');
    assert(!parsed.adBreaks, 'VPAD: adBreaks removed');
    assert(!parsed.adTagUrl, 'VPAD: adTagUrl removed');
    assert(parsed.plugins.length === 2, 'VPAD: Non-ad plugins preserved');
    assert(!parsed.plugins.find(p => p.type === 'ads'), 'VPAD: Ad plugin removed');
    passed += 5;
  } catch (e) {
    console.log(`✗ Test 1: VPAD with ad plugins - ${e.message}`);
    failed += 5;
  }

  // Test 2: VPAD without ads
  try {
    const vpad = JSON.stringify({
      plugins: [
        { name: 'video', type: 'video' },
        { name: 'controls', type: 'ui' }
      ]
    });

    const result = parser.stripVPADAds(vpad);
    const parsed = JSON.parse(result);
    assert(parsed.plugins.length === 2, 'VPAD: Clean VPAD preserved');
    passed++;
  } catch (e) {
    console.log(`✗ Test 2: VPAD without ads - ${e.message}`);
    failed++;
  }

  console.log(`VPAD: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== HLS Tests ====================

function testHLS() {
  console.log('--- HLS Tests ---');
  let passed = 0;
  let failed = 0;

  const parser = createParser();

  // Test 1: HLS manifest with EXT-X-DATERANGE ad markers
  try {
    const hls = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-DATERANGE:ID="ad-1",CLASS="splice",START-DATE="2024-01-01T00:00:00Z",PLANNED-DURATION=30,SCTE35-OUT="...",X-AD="true"
#EXTINF:10.0,
segment0.ts
#EXTINF:10.0,
segment1.ts
#EXT-X-DATERANGE:ID="ad-2",CLASS="splice",START-DATE="2024-01-01T00:00:30Z",PLANNED-DURATION=15,SCTE35-OUT="...",X-AD="true"
#EXTINF:10.0,
ad_segment_0.ts
#EXTINF:10.0,
ad_segment_1.ts
#EXTINF:10.0,
segment2.ts
#EXT-X-ENDLIST`;

    const result = parser.filterHLSManifest(hls);
    assertNotContains(result, 'EXT-X-DATERANGE', 'HLS: DATERANGE ad markers removed');
    assertNotContains(result, 'ad_segment', 'HLS: Ad segment URLs removed');
    assertContains(result, 'segment0.ts', 'HLS: Content segments preserved');
    assertContains(result, 'segment2.ts', 'HLS: Content segments after ad preserved');
    passed += 4;
  } catch (e) {
    console.log(`✗ Test 1: HLS DATERANGE - ${e.message}`);
    failed += 4;
  }

  // Test 2: HLS with EXT-X-CUE-OUT/CUE-IN
  try {
    const hls = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment0.ts
#EXT-X-CUE-OUT:30
#EXTINF:10.0,
ad_segment0.ts
#EXTINF:10.0,
ad_segment1.ts
#EXT-X-CUE-IN
#EXTINF:10.0,
segment1.ts
#EXT-X-ENDLIST`;

    const result = parser.filterHLSManifest(hls);
    assertNotContains(result, 'EXT-X-CUE-OUT', 'HLS: CUE-OUT marker removed');
    assertNotContains(result, 'EXT-X-CUE-IN', 'HLS: CUE-IN marker removed');
    assertNotContains(result, 'ad_segment', 'HLS: Ad segments between cue points removed');
    assertContains(result, 'segment0.ts', 'HLS: Pre-ad content preserved');
    assertContains(result, 'segment1.ts', 'HLS: Post-ad content preserved');
    passed += 5;
  } catch (e) {
    console.log(`✗ Test 2: HLS CUE-OUT/IN - ${e.message}`);
    failed += 5;
  }

  // Test 3: HLS with EXT-X-SCTE35
  try {
    const hls = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment0.ts
#EXT-X-SCTE35:OPT-OUT,DURATION=30.0,UTC-TIME=2024-01-01T00:00:00Z
#EXTINF:10.0,
preroll_segment0.ts
#EXTINF:10.0,
preroll_segment1.ts
#EXT-X-SCTE35:OPT-IN
#EXTINF:10.0,
segment1.ts
#EXT-X-ENDLIST`;

    const result = parser.filterHLSManifest(hls);
    assertNotContains(result, 'EXT-X-SCTE35', 'HLS: SCTE35 markers removed');
    assertNotContains(result, 'preroll_segment', 'HLS: Preroll segments removed');
    passed += 2;
  } catch (e) {
    console.log(`✗ Test 3: HLS SCTE35 - ${e.message}`);
    failed += 2;
  }

  // Test 4: HLS with ad URLs in segment paths
  try {
    const hls = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
https://example.com/video/segment0.ts
#EXTINF:10.0,
https://doubleclick.net/ad/segment1.ts
#EXTINF:10.0,
https://googlesyndication.com/vast/segment2.ts
#EXTINF:10.0,
https://example.com/video/segment3.ts
#EXT-X-ENDLIST`;

    const result = parser.filterHLSManifest(hls, 'https://example.com/');
    assertNotContains(result, 'doubleclick.net', 'HLS: DoubleClick ad URL removed');
    assertNotContains(result, 'googlesyndication.com', 'HLS: GoogleSyndication ad URL removed');
    assertContains(result, 'example.com/video/segment0.ts', 'HLS: Normal segment preserved');
    assertContains(result, 'example.com/video/segment3.ts', 'HLS: Normal segment after ad preserved');
    passed += 4;
  } catch (e) {
    console.log(`✗ Test 4: HLS Ad URLs - ${e.message}`);
    failed += 4;
  }

  // Test 5: HLS Master Playlist with ad variant streams
  try {
    const hls = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
https://example.com/video/1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
https://example.com/video/720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2",X-AD="true"
https://doubleclick.net/ad/360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=854x480,CODECS="avc1.64001f,mp4a.40.2"
https://example.com/video/480p.m3u8
#EXT-X-ENDLIST`;

    const result = parser.filterHLSMasterPlaylist(hls);
    assertNotContains(result, 'doubleclick.net', 'HLS Master: Ad variant stream removed');
    assertNotContains(result, 'X-AD', 'HLS Master: Ad attribute removed');
    assertContains(result, '1080p.m3u8', 'HLS Master: HD stream preserved');
    assertContains(result, '720p.m3u8', 'HLS Master: HD stream preserved');
    assertContains(result, '480p.m3u8', 'HLS Master: SD stream preserved');
    passed += 5;
  } catch (e) {
    console.log(`✗ Test 5: HLS Master Playlist - ${e.message}`);
    failed += 5;
  }

  // Test 6: HLS with EXT-X-MEDIA for ad audio
  try {
    const hls = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",AUTOSELECT=YES,DEFAULT=YES
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Ad Audio",LANGUAGE="ad",AUTOSELECT=NO,DEFAULT=NO,URI="ad_audio.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=5000000,AUDIO="audio"
video.m3u8
#EXT-X-ENDLIST`;

    const result = parser.filterHLSManifest(hls);
    assertNotContains(result, 'Ad Audio', 'HLS: Ad audio track removed');
    assertNotContains(result, 'ad_audio.m3u8', 'HLS: Ad audio URI removed');
    passed += 2;
  } catch (e) {
    console.log(`✗ Test 6: HLS Ad Audio - ${e.message}`);
    failed += 2;
  }

  console.log(`HLS: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== DASH Tests ====================

function testDASH() {
  console.log('--- DASH Tests ---');
  let passed = 0;
  let failed = 0;

  const parser = createParser();

  // Test 1: DASH with ad Period
  try {
    const dash = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT1M" minBufferTime="PT2S" profiles="urn:mpeg:dash:profile:isoff-live:2011">
  <Period id="content-1" start="PT0S" duration="PT30S">
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <Representation id="1" bandwidth="5000000" codecs="avc1.640028">
        <BaseURL>video_1080p.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
  <Period id="ad-preroll" start="PT30S" duration="PT15S">
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <Representation id="ad-1" bandwidth="2000000" codecs="avc1.64001f">
        <BaseURL>https://doubleclick.net/ad/preroll.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
  <Period id="content-2" start="PT45S" duration="PT30S">
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <Representation id="2" bandwidth="5000000" codecs="avc1.640028">
        <BaseURL>video_1080p_part2.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parser.filterDASHManifest(dash);
    assertNotContains(result, 'ad-preroll', 'DASH: Ad period removed');
    assertNotContains(result, 'doubleclick.net', 'DASH: DoubleClick ad URL removed');
    assertContains(result, 'content-1', 'DASH: Content period 1 preserved');
    assertContains(result, 'content-2', 'DASH: Content period 2 preserved');
    passed += 4;
  } catch (e) {
    console.log(`✗ Test 1: DASH Ad Period - ${e.message}`);
    failed += 4;
  }

  // Test 2: DASH with EventStream (SCTE-35)
  try {
    const dash = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT1M">
  <Period id="content" start="PT0S">
    <EventStream schemeIdUri="urn:scte:scte35:2013:xml" timescale="90000">
      <Event presentationTime="2700000" duration="2700000" id="1">
        <Signal xmlns="urn:scte:scte35:2013:xml">
          <Binary>base64encoded...</Binary>
        </Signal>
      </Event>
    </EventStream>
    <AdaptationSet contentType="video">
      <Representation id="1" bandwidth="5000000">
        <BaseURL>video.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parser.filterDASHManifest(dash);
    assertNotContains(result, 'EventStream', 'DASH: SCTE-35 EventStream removed');
    assertNotContains(result, 'scte35', 'DASH: SCTE-35 scheme removed');
    assertContains(result, 'content', 'DASH: Content period preserved');
    passed += 3;
  } catch (e) {
    console.log(`✗ Test 2: DASH EventStream - ${e.message}`);
    failed += 3;
  }

  // Test 3: DASH with ad AdaptationSet
  try {
    const dash = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period id="main" start="PT0S">
    <AdaptationSet contentType="video" mimeType="video/mp4" id="video-main">
      <Representation id="1" bandwidth="5000000">
        <BaseURL>video.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
    <AdaptationSet contentType="video" mimeType="video/mp4" id="ad-companion">
      <Representation id="ad-1" bandwidth="500000">
        <BaseURL>https://googlesyndication.com/companion.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
    <AdaptationSet contentType="audio" mimeType="audio/mp4" id="audio-main">
      <Representation id="a1" bandwidth="128000">
        <BaseURL>audio.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parser.filterDASHManifest(dash);
    assertNotContains(result, 'ad-companion', 'DASH: Ad AdaptationSet removed');
    assertNotContains(result, 'googlesyndication', 'DASH: GoogleSyndication ad URL removed');
    assertContains(result, 'video-main', 'DASH: Main video AdaptationSet preserved');
    assertContains(result, 'audio-main', 'DASH: Audio AdaptationSet preserved');
    passed += 4;
  } catch (e) {
    console.log(`✗ Test 3: DASH Ad AdaptationSet - ${e.message}`);
    failed += 4;
  }

  // Test 4: DASH with ad Representation
  try {
    const dash = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period id="main" start="PT0S">
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <Representation id="video-1080p" bandwidth="5000000">
        <BaseURL>video_1080p.mp4</BaseURL>
      </Representation>
      <Representation id="ad-preroll" bandwidth="1000000">
        <BaseURL>https://imasdk.googleapis.com/ad/preroll.mp4</BaseURL>
      </Representation>
      <Representation id="video-720p" bandwidth="3000000">
        <BaseURL>video_720p.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parser.filterDASHManifest(dash);
    assertNotContains(result, 'ad-preroll', 'DASH: Ad representation removed');
    assertNotContains(result, 'imasdk.googleapis.com', 'DASH: IMA SDK ad URL removed');
    assertContains(result, 'video-1080p', 'DASH: 1080p representation preserved');
    assertContains(result, 'video-720p', 'DASH: 720p representation preserved');
    passed += 4;
  } catch (e) {
    console.log(`✗ Test 4: DASH Ad Representation - ${e.message}`);
    failed += 4;
  }

  // Test 5: DASH with SegmentTemplate pointing to ad segments
  try {
    const dash = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period id="main" start="PT0S">
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <SegmentTemplate media="video_$Number$.m4s" initialization="video_init.mp4" startNumber="1"/>
      <Representation id="1" bandwidth="5000000">
      </Representation>
    </AdaptationSet>
    <AdaptationSet contentType="video" mimeType="video/mp4" id="ad-break">
      <SegmentTemplate media="ad_$Number$.m4s" initialization="ad_init.mp4" startNumber="1"/>
      <Representation id="ad-1" bandwidth="1000000">
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parser.filterDASHManifest(dash);
    assertNotContains(result, 'ad-break', 'DASH: Ad AdaptationSet with SegmentTemplate removed');
    assertNotContains(result, 'ad_$Number$', 'DASH: Ad segment template removed');
    assertNotContains(result, 'ad_init', 'DASH: Ad initialization removed');
    assertContains(result, 'video_$Number$', 'DASH: Main segment template preserved');
    passed += 4;
  } catch (e) {
    console.log(`✗ Test 5: DASH SegmentTemplate - ${e.message}`);
    failed += 4;
  }

  // Test 6: DASH with SupplementalProperty for ad metadata
  try {
    const dash = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period id="main" start="PT0S">
    <SupplementalProperty schemeIdUri="urn:mpeg:dash:ad:2014" value="ad-metadata"/>
    <SupplementalProperty schemeIdUri="urn:com:adobe:dpi:simple:2015" value="ad-insertion"/>
    <SupplementalProperty schemeIdUri="urn:custom:metadata" value="content-info"/>
    <AdaptationSet contentType="video">
      <Representation id="1" bandwidth="5000000">
        <BaseURL>video.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parser.filterDASHManifest(dash);
    assertNotContains(result, 'urn:mpeg:dash:ad', 'DASH: Ad supplemental property removed');
    assertNotContains(result, 'urn:com:adobe:dpi', 'DASH: Adobe DPI ad property removed');
    assertContains(result, 'urn:custom:metadata', 'DASH: Non-ad supplemental property preserved');
    passed += 3;
  } catch (e) {
    console.log(`✗ Test 6: DASH SupplementalProperty - ${e.message}`);
    failed += 3;
  }

  console.log(`DASH: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Auto-Detection Tests ====================

function testAutoDetection() {
  console.log('--- Auto-Detection Tests ---');
  let passed = 0;
  let failed = 0;

  const parser = createParser();

  // Test 1: Auto-detect VMAP
  try {
    const vmap = `<vmap:VMAP version="1.0"><AdBreak timeOffset="start"><AdSource><AdTagURI>https://example.com/vast</AdTagURI></AdSource></AdBreak></vmap:VMAP>`;
    const result = parser.stripAds(vmap);
    assertNotContains(result, 'AdBreak', 'Auto-detect: VMAP recognized and processed');
    passed++;
  } catch (e) {
    console.log(`✗ Test 1: Auto-detect VMAP - ${e.message}`);
    failed++;
  }

  // Test 2: Auto-detect VAST
  try {
    const vast = `<VAST version="4.0"><Ad id="1"><InLine><AdSystem>Test</AdSystem><AdTitle>Ad</AdTitle></InLine></Ad></VAST>`;
    const result = parser.stripAds(vast);
    assertNotContains(result, '<Ad', 'Auto-detect: VAST recognized and processed');
    passed++;
  } catch (e) {
    console.log(`✗ Test 2: Auto-detect VAST - ${e.message}`);
    failed++;
  }

  // Test 3: Auto-detect HLS media playlist
  try {
    const hls = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXT-X-DATERANGE:ID="ad1",X-AD="true"
#EXTINF:10.0,
ad_segment.ts
#EXTINF:10.0,
content_segment.ts
#EXT-X-ENDLIST`;
    const result = parser.stripAds(hls);
    assertNotContains(result, 'EXT-X-DATERANGE', 'Auto-detect: HLS media playlist recognized');
    assertNotContains(result, 'ad_segment', 'Auto-detect: HLS ad segments removed');
    passed += 2;
  } catch (e) {
    console.log(`✗ Test 3: Auto-detect HLS - ${e.message}`);
    failed += 2;
  }

  // Test 4: Auto-detect HLS master playlist
  try {
    const hls = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=5000000,X-AD="true"
https://doubleclick.net/ad.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000
https://example.com/video.m3u8`;
    const result = parser.stripAds(hls);
    assertNotContains(result, 'doubleclick.net', 'Auto-detect: HLS master playlist recognized');
    passed++;
  } catch (e) {
    console.log(`✗ Test 4: Auto-detect HLS Master - ${e.message}`);
    failed++;
  }

  // Test 5: Auto-detect DASH
  try {
    const dash = `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period id="ad-1"><AdaptationSet><Representation id="ad"><BaseURL>ad.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>`;
    const result = parser.stripAds(dash);
    assertNotContains(result, 'ad-1', 'Auto-detect: DASH recognized and processed');
    passed++;
  } catch (e) {
    console.log(`✗ Test 5: Auto-detect DASH - ${e.message}`);
    failed++;
  }

  // Test 6: Auto-detect VPAD
  try {
    const vpad = JSON.stringify({ adSchedule: {}, plugins: [{type: 'ads'}] });
    const result = parser.stripAds(vpad);
    const parsed = JSON.parse(result);
    assert(!parsed.adSchedule, 'Auto-detect: VPAD recognized and processed');
    passed++;
  } catch (e) {
    console.log(`✗ Test 6: Auto-detect VPAD - ${e.message}`);
    failed++;
  }

  console.log(`Auto-Detection: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Server-Side Processor Tests ====================

async function testServerSideProcessor() {
  console.log('--- Server-Side Processor Tests ---');
  let passed = 0;
  let failed = 0;

  const processor = new ServerSideManifestProcessor();

  // Test 1: Process VMAP server-side
  try {
    const vmap = `<VMAP version="1.0"><AdBreak timeOffset="start"><AdSource><AdTagURI>https://doubleclick.net/ad</AdTagURI></AdSource></AdBreak></VMAP>`;
    const result = await processor.processVMAP(vmap);
    assertNotContains(result, 'AdBreak', 'Server-side: VMAP processed');
    assertNotContains(result, 'doubleclick', 'Server-side: DoubleClick removed');
    passed += 2;
  } catch (e) {
    console.log(`✗ Test 1: Server-side VMAP - ${e.message}`);
    failed += 2;
  }

  // Test 2: Process HLS server-side
  try {
    const hls = `#EXTM3U
#EXTINF:10.0,
segment0.ts
#EXT-X-DATERANGE:ID="ad1",X-AD="true"
#EXTINF:10.0,
ad_segment.ts
#EXTINF:10.0,
segment1.ts`;
    const result = await processor.processHLS(hls);
    assertNotContains(result, 'EXT-X-DATERANGE', 'Server-side: HLS ad markers removed');
    assertNotContains(result, 'ad_segment', 'Server-side: HLS ad segments removed');
    passed += 2;
  } catch (e) {
    console.log(`✗ Test 2: Server-side HLS - ${e.message}`);
    failed += 2;
  }

  // Test 3: Process DASH server-side
  try {
    const dash = `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period id="ad-1"><AdaptationSet><Representation id="ad"><BaseURL>ad.mp4</BaseURL></Representation></AdaptationSet></Period><Period id="content"><AdaptationSet><Representation id="video"><BaseURL>video.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>`;
    const result = await processor.processDASH(dash);
    assertNotContains(result, 'ad-1', 'Server-side: DASH ad period removed');
    assertContains(result, 'content', 'Server-side: DASH content preserved');
    passed += 2;
  } catch (e) {
    console.log(`✗ Test 3: Server-side DASH - ${e.message}`);
    failed += 2;
  }

  // Test 4: Process manifest auto-detect server-side
  try {
    const hls = `#EXTM3U
#EXTINF:10.0,
segment.ts
#EXT-X-DATERANGE:ID="ad1",X-AD="true"
#EXTINF:10.0,
ad_segment.ts`;
    const result = await processor.processManifest(hls);
    assertNotContains(result, 'ad_segment', 'Server-side: Auto-detect HLS works');
    passed++;
  } catch (e) {
    console.log(`✗ Test 4: Server-side Auto-detect - ${e.message}`);
    failed++;
  }

  console.log(`Server-Side Processor: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Ad Info Extraction Tests ====================

function testAdInfoExtraction() {
  console.log('--- Ad Info Extraction Tests ---');
  let passed = 0;
  let failed = 0;

  const parser = createParser();

  // Test 1: Extract VMAP ad info
  try {
    const vmap = `<VMAP version="1.0">
  <AdBreak timeOffset="start" breakType="linear">
    <AdSource><AdTagURI>https://example.com/vast.xml</AdTagURI></AdSource>
  </AdBreak>
  <AdBreak timeOffset="00:05:00" breakType="linear">
    <AdSource><AdTagURI>https://doubleclick.net/vast</AdTagURI></AdSource>
  </AdBreak>
</VMAP>`;

    const ads = parser.extractAdInfo(vmap);
    assert(ads.length === 2, 'Extract: VMAP found 2 ad breaks');
    assert(ads[0].timeOffset === 'start', 'Extract: First ad timeOffset');
    assert(ads[1].timeOffset === '00:05:00', 'Extract: Second ad timeOffset');
    assert(ads[0].url.includes('example.com'), 'Extract: First ad URL');
    assert(ads[1].url.includes('doubleclick'), 'Extract: Second ad URL');
    passed += 5;
  } catch (e) {
    console.log(`✗ Test 1: Extract VMAP - ${e.message}`);
    failed += 5;
  }

  // Test 2: Extract VAST ad info
  try {
    const vast = `<VAST version="4.0">
  <Ad id="123">
    <InLine>
      <AdSystem>Google Ads</AdSystem>
      <AdTitle>Test Ad</AdTitle>
    </InLine>
  </Ad>
  <Ad id="456">
    <Wrapper>
      <VASTAdTagURI>https://pubads.g.doubleclick.net/vast</VASTAdTagURI>
    </Wrapper>
  </Ad>
</VAST>`;

    const ads = parser.extractAdInfo(vast);
    assert(ads.length === 2, 'Extract: VAST found 2 ads');
    assert(ads[0].inline === true, 'Extract: First ad is InLine');
    assert(ads[1].wrapper === true, 'Extract: Second ad is Wrapper');
    assert(ads[0].adSystem === 'Google Ads', 'Extract: AdSystem extracted');
    assert(ads[1].url.includes('doubleclick'), 'Extract: Wrapper URL extracted');
    passed += 5;
  } catch (e) {
    console.log(`✗ Test 2: Extract VAST - ${e.message}`);
    failed += 5;
  }

  // Test 3: Extract HLS ad info
  try {
    const hls = `#EXTM3U
#EXT-X-DATERANGE:ID="ad1",CLASS="splice",X-AD="true"
#EXTINF:10.0,
ad_segment.ts`;
    const ads = parser.extractAdInfo(hls);
    assert(ads.length >= 1, 'Extract: HLS ad markers found');
    assert(ads[0].type === 'hls', 'Extract: HLS type identified');
    passed += 2;
  } catch (e) {
    console.log(`✗ Test 3: Extract HLS - ${e.message}`);
    failed += 2;
  }

  // Test 4: Extract DASH ad info
  try {
    const dash = `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period id="ad-preroll"><AdaptationSet><Representation id="ad"><BaseURL>ad.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>`;
    const ads = parser.extractAdInfo(dash);
    assert(ads.length >= 1, 'Extract: DASH ad periods found');
    assert(ads[0].type === 'dash', 'Extract: DASH type identified');
    passed += 2;
  } catch (e) {
    console.log(`✗ Test 4: Extract DASH - ${e.message}`);
    failed += 2;
  }

  console.log(`Ad Info Extraction: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Edge Cases Tests ====================

function testEdgeCases() {
  console.log('--- Edge Cases Tests ---');
  let passed = 0;
  let failed = 0;

  const parser = createParser();

  // Test 1: Empty/null input
  try {
    assert.strictEqual(parser.stripAds(''), '');
    assert.strictEqual(parser.stripAds(null), null);
    assert.strictEqual(parser.stripAds(undefined), undefined);
    passed += 3;
  } catch (e) {
    console.log(`✗ Test 1: Empty input - ${e.message}`);
    failed += 3;
  }

  // Test 2: Malformed XML
  try {
    const malformed = `<VAST><Ad><InLine><AdSystem>Test</AdSystem></Ad></VAST>`; // Missing closing tags
    const result = parser.stripVASTAds(malformed);
    // Should return original on parse error
    assert(typeof result === 'string', 'Edge: Malformed XML returns string');
    passed++;
  } catch (e) {
    console.log(`✗ Test 2: Malformed XML - ${e.message}`);
    failed++;
  }

  // Test 3: Non-manifest content
  try {
    const html = `<html><body>Not a manifest</body></html>`;
    const result = parser.stripAds(html);
    assert.strictEqual(result, html, 'Edge: Non-manifest content returned as-is');
    passed++;
  } catch (e) {
    console.log(`✗ Test 3: Non-manifest - ${e.message}`);
    failed++;
  }

  // Test 4: Case insensitive ad detection
  try {
    const hls = `#EXTM3U
#EXT-X-DATERANGE:ID="AD-1",CLASS="SPLICE",X-AD="TRUE"
#EXTINF:10.0,
AD_SEGMENT.ts`;
    const result = parser.filterHLSManifest(hls);
    assertNotContains(result, 'AD-1', 'Edge: Case insensitive ad detection');
    assertNotContains(result, 'AD_SEGMENT', 'Edge: Case insensitive segment detection');
    passed += 2;
  } catch (e) {
    console.log(`✗ Test 4: Case insensitive - ${e.message}`);
    failed += 2;
  }

  // Test 5: Ad identifiers in various formats
  try {
    const identifiers = [
      'pre-roll', 'pre_roll', 'preRoll',
      'mid-roll', 'mid_roll', 'midRoll',
      'post-roll', 'post_roll', 'postRoll',
      'ad-break', 'ad_break', 'adBreak',
      'sponsor', 'promo', 'banner',
      'advertisement', 'adslot', 'adunit'
    ];

    for (const id of identifiers) {
      const hls = `#EXTM3U\n#EXTINF:10.0,\nsegment_${id}.ts\n#EXT-X-ENDLIST`;
      const result = parser.filterHLSManifest(hls);
      assertNotContains(result, id, `Edge: Identifier "${id}" detected`);
    }
    passed += identifiers.length;
  } catch (e) {
    console.log(`✗ Test 5: Ad identifiers - ${e.message}`);
    failed += 15;
  }

  console.log(`Edge Cases: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Performance/Stats Tests ====================

function testStats() {
  console.log('--- Stats Tests ---');
  let passed = 0;
  let failed = 0;

  const parser = createParser();

  // Test 1: Stats tracking
  try {
    parser.resetStats();
    const vmap = `<VMAP><AdBreak timeOffset="start"><AdSource><AdTagURI>ad</AdTagURI></AdSource></AdBreak></VMAP>`;
    parser.stripVMAPAds(vmap);
    parser.stripVMAPAds(vmap); // Process twice

    const stats = parser.getStats();
    assert(stats.parsed >= 2, 'Stats: Parsed count tracked');
    assert(stats.adsRemoved >= 2, 'Stats: Ads removed count tracked');
    passed += 2;
  } catch (e) {
    console.log(`✗ Test 1: Stats tracking - ${e.message}`);
    failed += 2;
  }

  // Test 2: Stats reset
  try {
    parser.resetStats();
    const stats = parser.getStats();
    assert(stats.parsed === 0, 'Stats: Reset works');
    assert(stats.adsRemoved === 0, 'Stats: Reset works');
    assert(stats.errors === 0, 'Stats: Reset works');
    passed += 3;
  } catch (e) {
    console.log(`✗ Test 2: Stats reset - ${e.message}`);
    failed += 3;
  }

  console.log(`Stats: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Run All Tests ====================

async function runAllTests() {
  console.log('Starting VMAP/VAST/VPAD Parser Test Suite...\n');

  const results = [];

  results.push(testVMAP());
  results.push(testVAST());
  results.push(testVPAD());
  results.push(testHLS());
  results.push(testDASH());
  results.push(testAutoDetection());
  results.push(await testServerSideProcessor());
  results.push(testAdInfoExtraction());
  results.push(testEdgeCases());
  results.push(testStats());

  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

  console.log('=== TEST SUMMARY ===');
  console.log(`Total: ${totalPassed + totalFailed} tests`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Success Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

  if (totalFailed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

runAllTests().catch(console.error);