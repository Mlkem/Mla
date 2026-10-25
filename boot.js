/* TizenTube Content Filter - Cobalt side-by-side test bootstrap
   Preserves the official TizenTube userscript, SponsorBlock and DeArrow.
   Metadata filters cannot identify all regional or synthetic content. */
(function() {
  'use strict';
  if (window.__ttcfBoot) return;
  window.__ttcfBoot = true;
  var originalParse = JSON.parse;
  var stats = { blocked: 0, reasons: {} };
  var indic = /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/;
  var languages = /\b(?:hindi|punjabi|panjabi|tamil|telugu|malayalam|kannada|marathi|gujarati|bengali|bhojpuri|haryanvi|assamese|odia|bollywood|tollywood|kollywood|desi|hindustani|india|indian|bhakti)\b/i;
  var synthetic = /\b(?:ai[\s-]*(?:generated|created|made|voiceover|cover|music|animation|trailer|story|slop)|generated\s+(?:with|using|by)\s+ai|made\s+(?:with|using|by)\s+ai|synthetic\s+(?:voice|video)|text[\s-]*to[\s-]*(?:video|speech)|automated\s+(?:video|story|channel)|midjourney\s+(?:video|animation)|sora\s+(?:2|ai)\s+video|veo\s+(?:3|ai)\s+video)\b/i;
  var brainrot = /\b(?:brain[\s-]*rot|skibidi|rizzler|gyatt|what the sigma|sigma\s+(?:edit|boy)|ohio final boss|only in ohio|npc\s+(?:stream|live|challenge)|fanum tax|aura\s+(?:points|farming)|italian brainrot|bombardiro crocodilo|tralalero tralala|tung tung tung)\b/i;
  function txt(x) {
    if (typeof x === 'string') return x;
    if (!x || typeof x !== 'object') return '';
    if (typeof x.simpleText === 'string') return x.simpleText;
    if (typeof x.content === 'string') return x.content;
    if (Array.isArray(x.runs)) return x.runs.map(function(y) { return y.text || ''; }).join('');
    return '';
  }
  function card(i) {
    var t = i && i.tileRenderer, l = i && i.lockupViewModel;
    var v = i && (i.videoRenderer || i.gridVideoRenderer || i.compactVideoRenderer);
    var s = i && (i.shortsLockupViewModel || i.reelItemRenderer);
    if (!t && !l && !v && !s) return null;
    var tm = t && t.metadata && t.metadata.tileMetadataRenderer;
    var lm = l && l.metadata && l.metadata.lockupMetadataViewModel;
    var title = txt(tm && tm.title) || txt(lm && lm.title) || txt(v && v.title) || txt(s && (s.title || s.headline));
    var lines = tm && tm.lines;
    var first = lines && lines[0] && lines[0].lineRenderer && lines[0].lineRenderer.items;
    var channel = txt(first && first[0] && first[0].lineItemRenderer && first[0].lineItemRenderer.text) ||
      txt(lm && lm.metadata && lm.metadata.contentMetadataViewModel && lm.metadata.contentMetadataViewModel.metadataRows &&
        lm.metadata.contentMetadataViewModel.metadataRows[0] && lm.metadata.contentMetadataViewModel.metadataRows[0].metadataParts &&
        lm.metadata.contentMetadataViewModel.metadataRows[0].metadataParts[0] && lm.metadata.contentMetadataViewModel.metadataRows[0].metadataParts[0].text) ||
      txt(v && (v.ownerText || v.shortBylineText));
    var short = !!s || (l && l.contentType === 'LOCKUP_CONTENT_TYPE_SHORT') ||
      (t && (t.tvhtml5ShelfRendererType === 'TVHTML5_TILE_RENDERER_TYPE_SHORTS' ||
       t.onSelectCommand && t.onSelectCommand.reelWatchEndpoint));
    return { title: title, channel: channel, short: !!short };
  }
  function readSetting(key, def) { try { var v = localStorage.getItem(key); return v == null ? def : v; } catch(e) { return def; } }
  function blocked(i) {
    if (!i || typeof i !== 'object') return '';
    if (i.reelShelfRenderer || i.shelfRenderer && i.shelfRenderer.tvhtml5ShelfRendererType === 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS') return 'shorts-shelf';
    var c = card(i);
    if (!c) return '';
    var allow = readSetting('ttcf-allow-channels', '').toLowerCase().split(',').map(function(x){ return x.trim(); }).filter(Boolean);
    if (allow.some(function(x){ return c.channel.toLowerCase().indexOf(x)>=0; })) return '';
    var block = readSetting('ttcf-block-channels', '').toLowerCase().split(',').map(function(x){ return x.trim(); }).filter(Boolean);
    if (block.some(function(x){ return c.channel.toLowerCase().indexOf(x)>=0; })) return 'blocked-channel';
    if (c.short) return 'short';
    var info = c.title + ' ' + c.channel;
    if (indic.test(info)) return 'indic-script';
    if (languages.test(info)) return 'indian-keywords';
    if (synthetic.test(info)) return 'labeled-ai';
    if (brainrot.test(info)) return 'brainrot';
    return '';
  }
  function filter(root) {
    if (readSetting('ttcf-enabled', '1') === '0') return root;
    if (!root || typeof root !== 'object') return root;
    if (!(root.contents || root.continuationContents || root.onResponseReceivedActions ||
          root.onResponseReceivedEndpoints || root.entries)) return root;
    var seen = typeof WeakSet === 'function' ? new WeakSet() : null, checked = 0;
    function walk(obj, depth) {
      if (!obj || typeof obj !== 'object' || depth > 32 || checked++ > 60000) return;
      if (seen) { if (seen.has(obj)) return; seen.add(obj); }
      if (Array.isArray(obj)) {
        if (obj.some(function(x){ return card(x) || x && (x.reelShelfRenderer || x.shelfRenderer); })) {
          for (var i = obj.length-1; i>=0; i--) {
            var why = blocked(obj[i]);
            if (why) { obj.splice(i,1); stats.blocked++; stats.reasons[why]=(stats.reasons[why]||0)+1; }
          }
        }
        for (var j=0; j<obj.length;j++) walk(obj[j],depth+1);
      } else {
        Object.keys(obj).forEach(function(k) {
          if (k === 'responseContext' || k === 'trackingParams' || k === 'clickTrackingParams') return;
          if (obj[k] && typeof obj[k] === 'object') walk(obj[k],depth+1);
        });
      }
    }
    walk(root,0); return root;
  }
  JSON.parse = function() {
    var result = originalParse.apply(this,arguments);
    try { return filter(result); } catch(e) { return result; }
  };
  window.TTCF = { version: '0.3-test', stats: function() { return stats; },
    disable: function(){ try{localStorage.setItem('ttcf-enabled','0');}catch(e){} } };
  var official = document.createElement('script');
  official.nonce = (document.currentScript && document.currentScript.nonce) || (document.querySelector('script[nonce]') && document.querySelector('script[nonce]').nonce) || '';\n  official.src = 'https://cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/userScript.js';
  official.onload = function(){ console.info('[TTCF] official TizenTube loaded; content filter active'); };
  official.onerror = function(){ console.error('[TTCF] original TizenTube script failed'); };
  (document.head || document.documentElement).appendChild(official);
})();