(function () {
  'use strict';

  const AD_DOMAINS = new Set([
    'ads.yahoo.com',
    'ads.pubmatic.com',
    'ads.rubiconproject.com',
    'ads.linkedin.com',
    'ads.twitter.com',
    'ads.facebook.com',
    'ads.google.com',
    'ads.bing.com',
    'ads.yandex.ru',
    'ads.mopub.com',
    'ads.inmobi.com',
    'ads.flurry.com',
    'ads.admob.com',
    'ads.adcolony.com',
    'ads.vungle.com',
    'ads.unity3d.com',
    'ads.chartboost.com',
    'ads.applovin.com',
    'ads.ironsource.com',
    'ads.fyber.com',
    'ads.tapjoy.com',
    'ads.adjust.com',
    'ads.appsflyer.com',
    'ads.kochava.com',
    'ads.branch.io',
    'ads.singular.net',
    'ads.tenjin.io',
    'ads.airbridge.io',
    'ads.atomic.io',
    'ads.altrooz.com',
    'ads.avocarrot.com',
    'ads.bidmachine.io',
    'ads.bidswitch.net',
    'ads.brightroll.com',
    'ads.celtra.com',
    'ads.conversantmedia.com',
    'ads.criteo.com',
    'ads.cxense.com',
    'ads.dataxu.com',
    'ads.districtm.io',
    'ads.edgead.com',
    'ads.eyeviewads.com',
    'ads.flashtalking.com',
    'ads.freewheel.com',
    'ads.gumgum.com',
    'ads.hearstmags.com',
    'ads.indexexchange.com',
    'ads.inmobi.com',
    'ads.inneractive.mobi',
    'ads.ixlayer.com',
    'ads.jivox.com',
    'ads.kargo.com',
    'ads.krxd.net',
    'ads.liftoff.io',
    'ads.magnetic.com',
    'ads.mathtag.com',
    'ads.media.net',
    'ads.mediamath.com',
    'ads.moatads.com',
    'ads.mopub.com',
    'ads.nativo.com',
    'ads.nexage.com',
    'ads.openx.com',
    'ads.outbrain.com',
    'ads.pubmatic.com',
    'ads.pulsepoint.com',
    'ads.quantcast.com',
    'ads.rhythmone.com',
    'ads.rubiconproject.com',
    'ads.saymedia.com',
    'ads.sharethrough.com',
    'ads.sizmek.com',
    'ads.smartadserver.com',
    'ads.smaato.com',
    'ads.sonobi.com',
    'ads.sovrn.com',
    'ads.spotxchange.com',
    'ads.steelhouse.com',
    'ads.taboola.com',
    'ads.tapad.com',
    'ads.teads.tv',
    'ads.tremorvideo.com',
    'ads.trioninteractive.com',
    'ads.turn.com',
    'ads.undertone.com',
    'ads.unruly.co',
    'ads.vdopia.com',
    'ads.vibrantmedia.com',
    'ads.videoamp.com',
    'ads.videology.com',
    'ads.visualiq.com',
    'ads.widespace.com',
    'ads.xad.com',
    'ads.xaxis.com',
    'ads.yahoo.com',
    'ads.yieldmo.com',
    'ads.yieldlab.net',
    'ads.zemanta.com',
    'ad.doubleclick.net',
    'ad.turn.com',
    'ad.yieldmanager.com',
    'ad.zanox.com',
    'adclick.g.doubleclick.net',
    'adserver.adtechus.com',
    'adserver.adtech.de',
    'adserver.adtech.fr',
    'adserver.adtech.it',
    'adserver.adtech.jp',
    'adserver.adtech.es',
    'adserver.adtech.co.uk',
    'adserver.adtech.cn',
    'adserver.adtech.com.br',
    'adserver.adtech.com.au',
    'adserver.adtech.in',
    'adserver.adtech.ru',
    'adserver.adtech.pl',
    'adserver.adtech.nl',
    'adserver.adtech.se',
    'adserver.adtech.no',
    'adserver.adtech.dk',
    'adserver.adtech.fi',
    'adserver.adtech.at',
    'adserver.adtech.ch',
    'adserver.adtech.be',
    'adserver.adtech.ie',
    'adserver.adtech.pt',
    'adserver.adtech.gr',
    'adserver.adtech.hu',
    'adserver.adtech.cz',
    'adserver.adtech.sk',
    'adserver.adtech.si',
    'adserver.adtech.hr',
    'adserver.adtech.bg',
    'adserver.adtech.ro',
    'adserver.adtech.lt',
    'adserver.adtech.lv',
    'adserver.adtech.ee',
    'adserver.adtech.mt',
    'adserver.adtech.cy',
    'adserver.adtech.lu',
    'adserver.adtech.is',
    'adserver.adtech.li',
    'adserver.adtech.mc',
    'adserver.adtech.sm',
    'adserver.adtech.va',
    'adserver.adtech.ad',
    'adserver.adtech.ax',
    'adserver.adtech.fo',
    'adserver.adtech.gl',
    'adserver.adtech.gs',
    'adserver.adtech.io',
    'adserver.adtech.sh',
    'adserver.adtech.tc',
    'adserver.adtech.vg',
    'adserver.adtech.ai',
    'adserver.adtech.ms',
    'adserver.adtech.nf',
    'adserver.adtech.pn',
    'adserver.adtech.tk',
    'adserver.adtech.ml',
    'adserver.adtech.ga',
    'adserver.adtech.cf',
    'adserver.adtech.gq',
    'adservice.google.com',
    'adservice.google.de',
    'adservice.google.fr',
    'adservice.google.it',
    'adservice.google.jp',
    'adservice.google.es',
    'adservice.google.co.uk',
    'adservice.google.cn',
    'adservice.google.com.br',
    'adservice.google.com.au',
    'adservice.google.in',
    'adservice.google.ru',
    'adservice.google.pl',
    'adservice.google.nl',
    'adservice.google.se',
    'adservice.google.no',
    'adservice.google.dk',
    'adservice.google.fi',
    'adservice.google.at',
    'adservice.google.ch',
    'adservice.google.be',
    'adservice.google.ie',
    'adservice.google.pt',
    'adservice.google.gr',
    'adservice.google.hu',
    'adservice.google.cz',
    'adservice.google.sk',
    'adservice.google.si',
    'adservice.google.hr',
    'adservice.google.bg',
    'adservice.google.ro',
    'adservice.google.lt',
    'adservice.google.lv',
    'adservice.google.ee',
    'adservice.google.mt',
    'adservice.google.cy',
    'adservice.google.lu',
    'adservice.google.is',
    'adservice.google.li',
    'adservice.google.mc',
    'adservice.google.sm',
    'adservice.google.va',
    'adservice.google.ad',
    'adservice.google.ax',
    'adservice.google.fo',
    'adservice.google.gl',
    'adservice.google.gs',
    'adservice.google.io',
    'adservice.google.sh',
    'adservice.google.tc',
    'adservice.google.vg',
    'adservice.google.ai',
    'adservice.google.ms',
    'adservice.google.nf',
    'adservice.google.pn',
    'adservice.google.tk',
    'adservice.google.ml',
    'adservice.google.ga',
    'adservice.google.cf',
    'adservice.google.gq',
    'pagead2.googlesyndication.com',
    'pagead.l.doubleclick.net',
    'googleads.g.doubleclick.net',
    'pubads.g.doubleclick.net',
    'securepubads.g.doubleclick.net',
    'tpc.googlesyndication.com',
    'partner.googleadservices.com',
    'www.googleadservices.com',
    'ads.google.com',
    'adservice.google.com',
    'ads.youtube.com',
    'static.doubleclick.net',
    'cdn.adnxs.com',
    'cdn.adsafeprotected.com',
    'cdn.adverline.com',
    'cdn.advertising.com',
    'cdn.adskeeper.com',
    'cdn.adsupply.com',
    'cdn.adup-tech.com',
    'cdn.advolution.com',
    'cdn.aerserv.com',
    'cdn.amobee.com',
    'cdn.appnexus.com',
    'cdn.avocarrot.com',
    'cdn.bidmachine.io',
    'cdn.bidswitch.net',
    'cdn.brightroll.com',
    'cdn.cedexis.com',
    'cdn.cedexis-radar.net',
    'cdn.cedexis-test.net',
    'cdn.celtra.com',
    'cdn.conversantmedia.com',
    'cdn.criteo.com',
    'cdn.cxense.com',
    'cdn.dataxu.com',
    'cdn.districtm.io',
    'cdn.edgead.com',
    'cdn.eyeviewads.com',
    'cdn.flashtalking.com',
    'cdn.freewheel.com',
    'cdn.gumgum.com',
    'cdn.hearstmags.com',
    'cdn.indexexchange.com',
    'cdn.inmobi.com',
    'cdn.inneractive.mobi',
    'cdn.ixlayer.com',
    'cdn.jivox.com',
    'cdn.kargo.com',
    'cdn.krxd.net',
    'cdn.liftoff.io',
    'cdn.magnetic.com',
    'cdn.mathtag.com',
    'cdn.media.net',
    'cdn.mediamath.com',
    'cdn.moatads.com',
    'cdn.mopub.com',
    'cdn.nativo.com',
    'cdn.nexage.com',
    'cdn.openx.com',
    'cdn.outbrain.com',
    'cdn.pubmatic.com',
    'cdn.pulsepoint.com',
    'cdn.quantcast.com',
    'cdn.rhythmone.com',
    'cdn.rubiconproject.com',
    'cdn.saymedia.com',
    'cdn.sharethrough.com',
    'cdn.sizmek.com',
    'cdn.smartadserver.com',
    'cdn.smaato.com',
    'cdn.sonobi.com',
    'cdn.sovrn.com',
    'cdn.spotxchange.com',
    'cdn.steelhouse.com',
    'cdn.taboola.com',
    'cdn.tapad.com',
    'cdn.teads.tv',
    'cdn.tremorvideo.com',
    'cdn.trioninteractive.com',
    'cdn.turn.com',
    'cdn.undertone.com',
    'cdn.unruly.co',
    'cdn.vdopia.com',
    'cdn.vibrantmedia.com',
    'cdn.videoamp.com',
    'cdn.videology.com',
    'cdn.visualiq.com',
    'cdn.widespace.com',
    'cdn.xad.com',
    'cdn.xaxis.com',
    'cdn.yahoo.com',
    'cdn.yieldmo.com',
    'cdn.yieldlab.net',
    'cdn.zemanta.com',
    'tracking.adform.net',
    'tracking.adform.dk',
    'tracking.adform.no',
    'tracking.adform.se',
    'tracking.adform.fi',
    'tracking.adform.de',
    'tracking.adform.fr',
    'tracking.adform.it',
    'tracking.adform.es',
    'tracking.adform.pl',
    'tracking.adform.nl',
    'tracking.adform.at',
    'tracking.adform.ch',
    'tracking.adform.be',
    'tracking.adform.ie',
    'tracking.adform.pt',
    'tracking.adform.gr',
    'tracking.adform.hu',
    'tracking.adform.cz',
    'tracking.adform.sk',
    'tracking.adform.si',
    'tracking.adform.hr',
    'tracking.adform.bg',
    'tracking.adform.ro',
    'tracking.adform.lt',
    'tracking.adform.lv',
    'tracking.adform.ee',
    'tracking.adform.mt',
    'tracking.adform.cy',
    'tracking.adform.lu',
    'tracking.adform.is',
    'tracking.adform.li',
    'tracking.adform.mc',
    'tracking.adform.sm',
    'tracking.adform.va',
    'tracking.adform.ad',
    'tracking.adform.ax',
    'tracking.adform.fo',
    'tracking.adform.gl',
    'tracking.adform.gs',
    'tracking.adform.io',
    'tracking.adform.sh',
    'tracking.adform.tc',
    'tracking.adform.vg',
    'tracking.adform.ai',
    'tracking.adform.ms',
    'tracking.adform.nf',
    'tracking.adform.pn',
    'tracking.adform.tk',
    'tracking.adform.ml',
    'tracking.adform.ga',
    'tracking.adform.cf',
    'tracking.adform.gq',
    'ib.adnxs.com',
    'tags.tiqcdn.com',
    'tags.crwdcntrl.net',
    'tags.bluekai.com',
    'tags.exelator.com',
    'tags.admeld.com',
    'tags.nexage.com',
    'tags.rubiconproject.com',
    'tags.pubmatic.com',
    'tags.openx.com',
    'tags.smaato.com',
    'tags.mopub.com',
    'tags.inmobi.com',
    'tags.millennialmedia.com',
    'tags.jumptap.com',
    'tags.mobclix.com',
    'tags.admarvel.com',
    'tags.greystripe.com',
    'tags.adtouch.com',
    'tags.mobfox.com',
    'tags.leadbolt.com',
    'tags.startapp.com',
    'tags.appnext.com',
    'tags.chartboost.com',
    'tags.vungle.com',
    'tags.unity3d.com',
    'tags.applovin.com',
    'tags.ironsource.com',
    'tags.fyber.com',
    'tags.tapjoy.com',
    'tags.adcolony.com',
    'tags.flurry.com',
    'tags.kochava.com',
    'tags.appsflyer.com',
    'tags.adjust.com',
    'tags.branch.io',
    'tags.singular.net',
    'tags.tenjin.io',
    'tags.airbridge.io',
    'tags.atomic.io',
    'tags.altrooz.com',
    'tags.avocarrot.com',
    'tags.bidmachine.io',
    'tags.bidswitch.net',
    'tags.brightroll.com',
    'tags.celtra.com',
    'tags.conversantmedia.com',
    'tags.criteo.com',
    'tags.cxense.com',
    'tags.dataxu.com',
    'tags.districtm.io',
    'tags.edgead.com',
    'tags.eyeviewads.com',
    'tags.flashtalking.com',
    'tags.freewheel.com',
    'tags.gumgum.com',
    'tags.hearstmags.com',
    'tags.indexexchange.com',
    'tags.inneractive.mobi',
    'tags.ixlayer.com',
    'tags.jivox.com',
    'tags.kargo.com',
    'tags.krxd.net',
    'tags.liftoff.io',
    'tags.magnetic.com',
    'tags.mathtag.com',
    'tags.media.net',
    'tags.mediamath.com',
    'tags.moatads.com',
    'tags.nativo.com',
    'tags.nexage.com',
    'tags.outbrain.com',
    'tags.pulsepoint.com',
    'tags.quantcast.com',
    'tags.rhythmone.com',
    'tags.saymedia.com',
    'tags.sharethrough.com',
    'tags.sizmek.com',
    'tags.smartadserver.com',
    'tags.sonobi.com',
    'tags.sovrn.com',
    'tags.spotxchange.com',
    'tags.steelhouse.com',
    'tags.taboola.com',
    'tags.tapad.com',
    'tags.teads.tv',
    'tags.tremorvideo.com',
    'tags.trioninteractive.com',
    'tags.turn.com',
    'tags.undertone.com',
    'tags.unruly.co',
    'tags.vdopia.com',
    'tags.vibrantmedia.com',
    'tags.videoamp.com',
    'tags.videology.com',
    'tags.visualiq.com',
    'tags.widespace.com',
    'tags.xad.com',
    'tags.xaxis.com',
    'tags.yieldmo.com',
    'tags.yieldlab.net',
    'tags.zemanta.com',
    'analytics.twitter.com',
    'analytics.facebook.com',
    'analytics.linkedin.com',
    'analytics.pinterest.com',
    'analytics.snapchat.com',
    'analytics.tiktok.com',
    'analytics.reddit.com',
    'analytics.quora.com',
    'analytics.medium.com',
    'analytics.tumblr.com',
    'analytics.flickr.com',
    'analytics.instagram.com',
    'analytics.whatsapp.com',
    'analytics.messenger.com',
    'analytics.telegram.org',
    'analytics.signal.org',
    'analytics.discord.com',
    'analytics.slack.com',
    'analytics.teams.microsoft.com',
    'analytics.zoom.us',
    'analytics.webex.com',
    'analytics.gotomeeting.com',
    'analytics.join.me',
    'analytics.bluejeans.com',
    'analytics.whereby.com',
    'analytics.jitsi.org',
    'analytics.meet.google.com',
    'analytics.cisco.com',
    'analytics.polycom.com',
    'analytics.lifesize.com',
    'analytics.vidyo.com',
    'analytics.highfive.com',
    'analytics.uberconference.com',
    'analytics.freeconferencecall.com',
    'analytics.conferencecall.com',
    'analytics.webex.com',
    'analytics.goto.com',
    'analytics.logmein.com',
    'analytics.teamviewer.com',
    'analytics.anydesk.com',
    'analytics.chrome.google.com',
    'analytics.remote.it',
    'analytics.parallels.com',
    'analytics.vmware.com',
    'analytics.citrix.com',
    'analytics.microsoft.com',
    'analytics.apple.com',
    'analytics.google.com',
    'analytics.amazon.com',
    'analytics.azure.com',
    'analytics.aws.amazon.com',
    'analytics.digitalocean.com',
    'analytics.linode.com',
    'analytics.vultr.com',
    'analytics.hetzner.com',
    'analytics.ovh.com',
    'analytics.scaleway.com',
    'analytics.upcloud.com',
    'analytics.kamatera.com',
    'analytics.rackspace.com',
    'analytics.ionos.com',
    'analytics.godaddy.com',
    'analytics.namecheap.com',
    'analytics.cloudflare.com',
    'analytics.fastly.com',
    'analytics.cloudflareflare.com',
    'analytics.stackpath.com',
    'analytics.keycdn.com',
    'analytics.cdn77.com',
    'analytics.bunnycdn.com',
    'analytics.jetstream.com',
    'analytics.medianova.com',
    'analytics.cdnvideo.ru',
    'analytics.gcdn.co',
    'analytics.cdnify.io',
    'analytics.incapsula.com',
    'analytics.sucuri.net',
    'analytics.cloudflare.com',
    'analytics.imperva.com',
    'analytics.akamai.com',
    'analytics.edgecast.com',
    'analytics.level3.com',
    'analytics.llnw.net',
    'analytics.highwinds.com',
    'analytics.cdnetworks.com',
    'analytics.chinacache.com',
    'analytics.qiniu.com',
    'analytics.upyun.com',
    'analytics.aliyun.com',
    'analytics.tencent.com',
    'analytics.baishancloud.com',
    'analytics.wangsu.com',
    'analytics.51cdn.com',
    'analytics.cdn20.com',
    'analytics.yunjiasu.com',
    'analytics.verycdn.com',
    'analytics.cdnfly.com',
    'analytics.yunsuo.com.cn',
    'analytics.freebuf.com',
    'analytics.knownsec.com',
    'analytics.sangfor.com.cn',
    'analytics.hillstonenet.com',
    'analytics.nsfocus.com',
    'analytics.venustech.com.cn',
    'analytics.topsec.com.cn',
    'analytics.dbappsecurity.com.cn',
    'analytics.qihoo.com',
    'analytics.360.cn',
    'analytics.rising.com.cn',
    'analytics.kingsoft.com',
    'analytics.duba.com',
    'analytics.ijinshan.com',
    'analytics.qq.com',
    'analytics.weibo.com',
    'analytics.taobao.com',
    'analytics.tmall.com',
    'analytics.1688.com',
    'analytics.aliexpress.com',
    'analytics.dhgate.com',
    'analytics.made-in-china.com',
    'globalsign.com',
    'globalsign.net',
    'symantec.com',
    'verisign.com',
    'thawte.com',
    'geotrust.com',
    'rapidssl.com',
    'comodo.com',
    'sectigo.com',
    'entrust.net',
    'godaddy.com',
    'namecheap.com',
    'ssl.com',
    'digicert.com',
    'letsencrypt.org',
    'zerossl.com',
    'buypass.com',
    'sslforfree.com',
    'freessl.org',
    'instantssl.com',
    'positivessl.com',
    'essentialssl.com',
    'eliteSSL.com',
    'wildcardssl.com',
    'multidomainssl.com',
    'ucertificates.com',
    'ssl2buy.com',
    'cheapsslsecurity.com',
    'sslshopper.com',
    'sslmate.com',
    'ssls.com',
    'sslstore.com',
    'thesslstore.com',
    'ssldragon.com',
    'sslsupportdesk.com',
    'ssltools.com',
    'whynopadlock.com',
    'ssllabs.com',
    'qualys.com',
    'sslyze.org',
    'testssl.sh',
    'cryptcheck.fr',
    'checktls.com',
    'mxtoolbox.com',
    'dnschecker.org',
    'whatsmydns.net',
    'intoDNS.com',
    'dnsviz.net',
    'dnstable.com',
    'securitytrails.com',
    'viewdns.info',
    'centralops.net',
    'domaintools.com',
    'whois.com',
    'whois.net',
    'who.is',
    'whois.icann.org',
    'whois.internic.net',
    'whois.verisign-grs.com',
    'whois.pir.org',
    'whois.nic.uk',
    'whois.denic.de',
    'whois.nic.fr',
    'whois.nic.it',
    'whois.nic.es',
    'whois.nic.nl',
    'whois.nic.se',
    'whois.nic.no',
    'whois.nic.dk',
    'whois.nic.fi',
    'whois.nic.at',
    'whois.nic.ch',
    'whois.nic.be',
    'whois.nic.ie',
    'whois.nic.pt',
    'whois.nic.gr',
    'whois.nic.hu',
    'whois.nic.cz',
    'whois.nic.sk',
    'whois.nic.si',
    'whois.nic.hr',
    'whois.nic.bg',
    'whois.nic.ro',
    'whois.nic.lt',
    'whois.nic.lv',
    'whois.nic.ee',
    'whois.nic.mt',
    'whois.nic.cy',
    'whois.nic.lu',
    'whois.nic.is',
    'whois.nic.li',
    'whois.nic.mc',
    'whois.nic.sm',
    'whois.nic.va',
    'whois.nic.ad',
    'whois.nic.ax',
    'whois.nic.fo',
    'whois.nic.gl',
    'whois.nic.gs',
    'whois.nic.io',
    'whois.nic.sh',
    'whois.nic.tc',
    'whois.nic.vg',
    'whois.nic.ai',
    'whois.nic.ms',
    'whois.nic.nf',
    'whois.nic.pn',
    'whois.nic.tk',
    'whois.nic.ml',
    'whois.nic.ga',
    'whois.nic.cf',
    'whois.nic.gq',
    'pagead2.googlesyndication.com',
    'pagead.l.doubleclick.net',
    'googleads.g.doubleclick.net',
    'pubads.g.doubleclick.net',
    'securepubads.g.doubleclick.net',
    'tpc.googlesyndication.com',
    'partner.googleadservices.com',
    'www.googleadservices.com',
    'ads.google.com',
    'adservice.google.com',
    'ads.youtube.com',
    'static.doubleclick.net',
    'cdn.adnxs.com',
    'cdn.adsafeprotected.com',
    'cdn.adverline.com',
    'cdn.advertising.com',
    'cdn.adskeeper.com',
    'cdn.adsupply.com',
    'cdn.adup-tech.com',
    'cdn.advolution.com',
    'cdn.aerserv.com',
    'cdn.amobee.com',
    'cdn.appnexus.com',
    'cdn.avocarrot.com',
    'cdn.bidmachine.io',
    'cdn.bidswitch.net',
    'cdn.brightroll.com',
    'cdn.cedexis.com',
    'cdn.cedexis-radar.net',
    'cdn.cedexis-test.net',
    'cdn.celtra.com',
    'cdn.conversantmedia.com',
    'cdn.criteo.com',
    'cdn.cxense.com',
    'cdn.dataxu.com',
    'cdn.districtm.io',
    'cdn.edgead.com',
    'cdn.eyeviewads.com',
    'cdn.flashtalking.com',
    'cdn.freewheel.com',
    'cdn.gumgum.com',
    'cdn.hearstmags.com',
    'cdn.indexexchange.com',
    'cdn.inmobi.com',
    'cdn.inneractive.mobi',
    'cdn.ixlayer.com',
    'cdn.jivox.com',
    'cdn.kargo.com',
    'cdn.krxd.net',
    'cdn.liftoff.io',
    'cdn.magnetic.com',
    'cdn.mathtag.com',
    'cdn.media.net',
    'cdn.mediamath.com',
    'cdn.moatads.com',
    'cdn.mopub.com',
    'cdn.nativo.com',
    'cdn.nexage.com',
    'cdn.openx.com',
    'cdn.outbrain.com',
    'cdn.pubmatic.com',
    'cdn.pulsepoint.com',
    'cdn.quantcast.com',
    'cdn.rhythmone.com',
    'cdn.rubiconproject.com',
    'cdn.saymedia.com',
    'cdn.sharethrough.com',
    'cdn.sizmek.com',
    'cdn.smartadserver.com',
    'cdn.smaato.com',
    'cdn.sonobi.com',
    'cdn.sovrn.com',
    'cdn.spotxchange.com',
    'cdn.steelhouse.com',
    'cdn.taboola.com',
    'cdn.tapad.com',
    'cdn.teads.tv',
    'cdn.tremorvideo.com',
    'cdn.trioninteractive.com',
    'cdn.turn.com',
    'cdn.undertone.com',
    'cdn.unruly.co',
    'cdn.vdopia.com',
    'cdn.vibrantmedia.com',
    'cdn.videoamp.com',
    'cdn.videology.com',
    'cdn.visualiq.com',
    'cdn.widespace.com',
    'cdn.xad.com',
    'cdn.xaxis.com',
    'cdn.yahoo.com',
    'cdn.yieldmo.com',
    'cdn.yieldlab.net',
    'cdn.zemanta.com',
    'tracking.adform.net',
    'tracking.adform.dk',
    'tracking.adform.no',
    'tracking.adform.se',
    'tracking.adform.fi',
    'tracking.adform.de',
    'tracking.adform.fr',
    'tracking.adform.it',
    'tracking.adform.es',
    'tracking.adform.pl',
    'tracking.adform.nl',
    'tracking.adform.at',
    'tracking.adform.ch',
    'tracking.adform.be',
    'tracking.adform.ie',
    'tracking.adform.pt',
    'tracking.adform.gr',
    'tracking.adform.hu',
    'tracking.adform.cz',
    'tracking.adform.sk',
    'tracking.adform.si',
    'tracking.adform.hr',
    'tracking.adform.bg',
    'tracking.adform.ro',
    'tracking.adform.lt',
    'tracking.adform.lv',
    'tracking.adform.ee',
    'tracking.adform.mt',
    'tracking.adform.cy',
    'tracking.adform.lu',
    'tracking.adform.is',
    'tracking.adform.li',
    'tracking.adform.mc',
    'tracking.adform.sm',
    'tracking.adform.va',
    'tracking.adform.ad',
    'tracking.adform.ax',
    'tracking.adform.fo',
    'tracking.adform.gl',
    'tracking.adform.gs',
    'tracking.adform.io',
    'tracking.adform.sh',
    'tracking.adform.tc',
    'tracking.adform.vg',
    'tracking.adform.ai',
    'tracking.adform.ms',
    'tracking.adform.nf',
    'tracking.adform.pn',
    'tracking.adform.tk',
    'tracking.adform.ml',
    'tracking.adform.ga',
    'tracking.adform.cf',
    'tracking.adform.gq'
  ]);

  function isAdDomain(url) {
    try {
      const hostname = new URL(url).hostname;
      return AD_DOMAINS.has(hostname) || AD_DOMAINS.has(hostname.replace(/^www\./, ''));
    } catch (e) {
      return false;
    }
  }

  function blockAdRequests() {
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      if (isAdDomain(url)) {
        return Promise.reject(new Error('Blocked ad request'));
      }
      return originalFetch.apply(this, arguments);
    };

    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (isAdDomain(url)) {
        this.abort();
        return;
      }
      return originalXHROpen.apply(this, arguments);
    };

    const originalSendBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function (url, data) {
      if (isAdDomain(url)) {
        return true;
      }
      return originalSendBeacon.apply(this, arguments);
    };
  }

  const AD_TAG_NAMES = new Set([
    'ad-slot', 'ad-banner', 'ad-container', 'ad-wrapper', 'ad-unit',
    'google-ad', 'adsbygoogle', 'dfp-ad', 'amazon-ad', 'adsense',
    'doubleclick-ad', 'adform-ad', 'criteo-ad', 'taboola-ad',
    'outbrain-ad', 'revcontent-ad', 'content-ad', 'native-ad',
    'sponsored-content', 'promoted-content', 'recommended-content',
    'ad-placeholder', 'ad-frame', 'ad-iframe', 'ad-script',
    'banner-ad', 'leaderboard-ad', 'skyscraper-ad', 'rectangle-ad',
    'square-ad', 'button-ad', 'halfpage-ad', 'large-ad',
    'mobile-ad', 'desktop-ad', 'tablet-ad', 'responsive-ad',
    'interstitial-ad', 'popup-ad', 'popunder-ad', 'overlay-ad',
    'floating-ad', 'sticky-ad', 'anchor-ad', 'slide-in-ad',
    'expandable-ad', 'rich-media-ad', 'video-ad', 'audio-ad',
    'native-ad-item', 'in-feed-ad', 'in-article-ad', 'in-stream-ad',
    'out-stream-ad', 'rewarded-ad', 'offerwall-ad', 'survey-ad'
  ]);

  function blockCustomElements() {
    const originalDefine = customElements.define;
    customElements.define = function (name, constructor, options) {
      if (AD_TAG_NAMES.has(name.toLowerCase())) {
        return;
      }
      return originalDefine.apply(this, arguments);
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            if (AD_TAG_NAMES.has(tagName)) {
              node.remove();
            }
            const adElements = node.querySelectorAll('[class*="ad-"], [id*="ad-"], [data-ad], [data-adslot], [data-ad-client], [data-ad-format]');
            adElements.forEach(el => el.remove());
          }
        }
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  const COOKIE_KEYWORDS = [
    'accept', 'agree', 'consent', 'cookie', 'gdpr', 'privacy',
    'allow', 'ok', 'got it', 'understand', 'continue', 'proceed',
    'ich stimme zu', 'akzeptieren', 'zustimmen', 'einverstanden',
    'accepter', 'accepter tout', 'tout accepter', 'j\'accepte',
    'aceptar', 'aceptar todo', 'estoy de acuerdo', 'continuar',
    'accettare', 'accetta tutto', 'sono d\'accordo', 'continua',
    'acordar', 'concordar', 'aceitar', 'continuar',
    'godzic', 'zgadzam sie', 'akceptuj', 'kontynuuj',
    'souhlasit', 'souhlasim', 'pokracovat',
    'hvala', 'strinjam se', 'nadaljuj',
    'sutinku', 'priinu', 'tesiausi',
    'piekrītu', 'apstiprināt', 'turpināt',
    'sutinku', 'sutikti', 'testi',
    'הסכמה', 'אני מסכים', 'המשך',
    'قبول', 'أوافق', 'متابعة',
    '接受', '同意', '继续',
    '同意', '接受', '繼續',
    '同意する', '受け入れる', '続ける',
    '동의', '수락', '계속',
    'ยอมรับ', 'ตกลง', 'ดำเนินต่อไป',
    'kabul et', 'kabul', 'devam et',
    'kabul etmek', 'kabul', 'devam',
    'принять', 'согласен', 'продолжить',
    'prihvati', 'slažem se', 'nastavi',
    'prihvatiti', 'slagati se', 'nastaviti',
    ' prihvaćam', 'nastavak',
    'akceptuję', 'zgadzam się', 'kontynuuj',
    'aceitar', 'concordo', 'continuar',
    'annehmen', 'zustimmen', 'fortfahren',
    'acconsentire', 'accettare', 'continuare',
    'accepter', 'accepter tout', 'continuer',
    'aceptar', 'aceptar todo', 'continuar',
    'godzic', 'zgadzam sie', 'kontynuuj'
  ];

  function detectCookieBanner(element) {
    const text = (element.textContent || '').toLowerCase();
    const hasCookieKeyword = COOKIE_KEYWORDS.some(keyword => text.includes(keyword));
    if (!hasCookieKeyword) return false;

    const style = window.getComputedStyle(element);
    const isFixed = style.position === 'fixed' || style.position === 'sticky';
    const isHighZIndex = parseInt(style.zIndex, 10) > 100;
    const hasButtons = element.querySelector('button, [role="button"], a[href]') !== null;
    const coversViewport = element.offsetWidth > window.innerWidth * 0.5 || element.offsetHeight > window.innerHeight * 0.3;

    return hasCookieKeyword && (isFixed || isHighZIndex || hasButtons || coversViewport);
  }

  function removeCookieBanners() {
    const elements = document.querySelectorAll('div, section, footer, header, aside, nav, main, article, dialog, [role="dialog"], [role="alertdialog"]');
    elements.forEach(el => {
      if (detectCookieBanner(el)) {
        const acceptBtn = el.querySelector('button, [role="button"], a[href]');
        if (acceptBtn && COOKIE_KEYWORDS.some(kw => acceptBtn.textContent.toLowerCase().includes(kw))) {
          acceptBtn.click();
        }
        el.remove();
      }
    });
  }

  function detectNewsletterPopup(element) {
    const form = element.querySelector('form');
    if (!form) return false;

    const style = window.getComputedStyle(element);
    const isFixed = style.position === 'fixed' || style.position === 'sticky';
    if (!isFixed) return false;

    const text = (element.textContent || '').toLowerCase();
    const hasEmailKeyword = /email|e-mail|mail|newsletter|subscribe|subscription|sign up|sign-up|join|updates|notify/.test(text);
    if (!hasEmailKeyword) return false;

    const hasEmailInput = form.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i], input[placeholder*="email" i]') !== null;
    const hasSubmitButton = form.querySelector('button[type="submit"], input[type="submit"], button:not([type]), [role="button"]') !== null;

    return hasEmailInput && hasSubmitButton;
  }

  function removeNewsletterPopups() {
    const elements = document.querySelectorAll('div, section, aside, dialog, [role="dialog"], [role="alertdialog"]');
    elements.forEach(el => {
      if (detectNewsletterPopup(el)) {
        el.remove();
      }
    });
  }

  function detectOverlayAd(element) {
    const style = window.getComputedStyle(element);
    const isFixed = style.position === 'fixed' || style.position === 'absolute';
    if (!isFixed) return false;

    const zIndex = parseInt(style.zIndex, 10);
    const isHighZIndex = !isNaN(zIndex) && zIndex > 9999;
    if (!isHighZIndex) return false;

    const rect = element.getBoundingClientRect();
    const viewportArea = window.innerWidth * window.innerHeight;
    const elementArea = rect.width * rect.height;
    const coverage = elementArea / viewportArea;
    const isLargeCoverage = coverage > 0.3;

    const hasAdContent = /ad|advert|sponsor|promo|banner|popup|modal|overlay/i.test(element.className + ' ' + element.id);
    const hasIframe = element.querySelector('iframe') !== null;
    const hasScript = element.querySelector('script') !== null;
    const hasImage = element.querySelector('img[src*="ad"], img[src*="banner"], img[src*="sponsor"]') !== null;

    return isLargeCoverage && (hasAdContent || hasIframe || hasScript || hasImage);
  }

  function removeOverlayAds() {
    const elements = document.querySelectorAll('div, section, aside, dialog, [role="dialog"], [role="alertdialog"]');
    elements.forEach(el => {
      if (detectOverlayAd(el)) {
        el.remove();
      }
    });
  }

  const ADBLOCK_DETECTORS = [
    'adblock', 'adBlock', 'adBlocker', 'adblocker', 'adBlockDetected',
    'detectAdblock', 'detectAdBlock', 'isAdBlocked', 'isAdblockActive',
    'adblockDetected', 'adBlockDetected', 'blockAdBlock', 'blockAdblock',
    'antiAdblock', 'antiAdBlock', 'antiAdBlocker', 'antiAdblocker',
    'adblockWarning', 'adBlockWarning', 'showAdblockNotice',
    'checkAdblock', 'checkAdBlock', 'verifyAdblock', 'verifyAdBlock',
    'adBlockerDetected', 'adblockerDetected', 'adsBlocked', 'ads_blocked',
    'adBlockEnabled', 'adblockEnabled', 'adBlockPresent', 'adblockPresent'
  ];

  function overrideAdblockDetectors() {
    ADBLOCK_DETECTORS.forEach(name => {
      try {
        if (typeof window[name] === 'function') {
          window[name] = function () { return false; };
        } else if (window.hasOwnProperty(name)) {
          Object.defineProperty(window, name, {
            value: false,
            writable: true,
            configurable: true
          });
        }
      } catch (e) {}
    });

    const originalDefineProperty = Object.defineProperty;
    Object.defineProperty = function (obj, prop, descriptor) {
      if (ADBLOCK_DETECTORS.includes(prop) && obj === window) {
        return originalDefineProperty(obj, prop, {
          value: false,
          writable: true,
          configurable: true
        });
      }
      return originalDefineProperty.apply(this, arguments);
    };
  }

  function removeAntiAdblockScripts() {
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => {
      const src = script.src || '';
      const content = script.textContent || '';
      if (/adblock|anti.?ad|block.?ad|detect.?ad/i.test(src + content)) {
        script.remove();
      }
    });
  }

  function init() {
    blockAdRequests();
    blockCustomElements();
    overrideAdblockDetectors();
    removeAntiAdblockScripts();

    const cleanupInterval = setInterval(() => {
      removeCookieBanners();
      removeNewsletterPopups();
      removeOverlayAds();
      removeAntiAdblockScripts();
    }, 1000);

    document.addEventListener('DOMContentLoaded', () => {
      removeCookieBanners();
      removeNewsletterPopups();
      removeOverlayAds();
    });

    return cleanupInterval;
  }

  const cleanupInterval = init();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cleanupInterval };
  }
})();