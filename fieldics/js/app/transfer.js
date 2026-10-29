/* FieldICS: Phone-to-phone transfer by a loop of QR codes, with no network. */
(function (A) {
  'use strict';

  var C = A.C;
  var S = A.S;
  var btn = A.btn;
  var commitSession = A.commitSession;
  var cur = A.cur;
  var deviceLabel = A.deviceLabel;
  var h = A.h;
  var openPanel = A.openPanel;
  var persist = A.persist;
  var plural = A.plural;
  var render = A.render;
  var toast = A.toast;
  var track = A.track;
  var importText = A.importText;
  var finishImport = A.finishImport;

  var QR = window.FieldQR;
  var VENDOR = { qrcode: 'js/vendor/qrcode-generator-2.0.4.js', jsQR: 'js/vendor/jsqr-1.4.0.js' };
  var loading = {};
  var running = null;

  /* Loads a vendored library the first time it is needed. The service worker keeps it for offline use. */
  function need(name) {
    if (window[name]) return Promise.resolve(window[name]);
    if (!loading[name]) {
      loading[name] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = VENDOR[name];
        s.onload = function () { if (window[name]) resolve(window[name]); else reject(new Error('The QR library did not load.')); };
        s.onerror = function () { loading[name] = null; reject(new Error('The QR library could not be loaded.')); };
        document.head.appendChild(s);
      });
    }
    return loading[name];
  }

  function stop() {
    if (!running) return;
    if (running.timer) clearInterval(running.timer);
    if (running.raf) cancelAnimationFrame(running.raf);
    if (running.stream) running.stream.getTracks().forEach(function (t) { t.stop(); });
    running = null;
  }

  /* ---------- packing ---------- */

  function toB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function fromB64(b64) {
    var s = atob(b64);
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function streamBytes(bytes, transform) {
    return new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  /* Text to a QR payload: 'z' + gzip base64 when the browser can compress, otherwise 'j' + base64. */
  function pack(text) {
    var bytes = new TextEncoder().encode(text);
    if (typeof CompressionStream === 'function') {
      return streamBytes(bytes, new CompressionStream('gzip')).then(function (z) { return 'z' + toB64(z); }, function () { return 'j' + toB64(bytes); });
    }
    return Promise.resolve('j' + toB64(bytes));
  }

  function unpack(payload) {
    var kind = payload.charAt(0);
    var bytes = fromB64(payload.slice(1));
    if (kind === 'j') return Promise.resolve(new TextDecoder().decode(bytes));
    if (kind !== 'z') return Promise.reject(new Error('This QR transfer is not one FieldICS can read.'));
    if (typeof DecompressionStream !== 'function') return Promise.reject(new Error('This browser cannot unpack the transfer. Update the browser, or use a package file.'));
    return streamBytes(bytes, new DecompressionStream('gzip')).then(function (b) { return new TextDecoder().decode(b); });
  }

  /* ---------- sending ---------- */

  function drawFrame(qrcode, text, canvas) {
    var q = qrcode(0, 'L');
    q.addData(text, 'Byte');
    q.make();
    var count = q.getModuleCount();
    var quiet = 4;
    var size = Math.min(canvas.width, canvas.height);
    var cell = Math.floor(size / (count + quiet * 2));
    var g = canvas.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#000000';
    var off = Math.floor((size - cell * count) / 2);
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (q.isDark(r, c)) g.fillRect(off + c * cell, off + r * cell, cell, cell);
      }
    }
  }

  function openQRSend() {
    var inc = cur();
    if (!inc) return;
    commitSession('leave');
    stop();
    var body = openPanel('Send by QR code');
    var scope = inc.lastExportAt ? 'changes' : 'full';
    body.appendChild(h('p', { text: 'On the other device, open Share and print, choose Receive by QR code, and point its camera at this screen. Hold steady about a foot away. The code changes several times a second until every part has arrived.' }));
    var choose = h('div', { class: 'row wrap' });
    var status = h('p', { class: 'hint', id: 'qrSendStatus', role: 'status' });
    var canvas = h('canvas', { id: 'qrCanvas', class: 'qr-canvas', width: '640', height: '640', 'aria-label': 'QR code' });
    var speed = h('select', { id: 'qrSpeed', 'aria-label': 'Speed' });
    [[600, 'Slow'], [350, 'Normal'], [200, 'Fast']].forEach(function (o) { speed.appendChild(h('option', { value: String(o[0]), text: o[1], selected: o[0] === 350 })); });
    function start(which) {
      stop();
      changesBtn.className = 'btn' + (which === 'changes' ? ' btn-primary' : '');
      fullBtn.className = 'btn' + (which === 'full' ? ' btn-primary' : '');
      status.textContent = 'Preparing...';
      /* QR codes are not encrypted, so patient records never go this way. */
      var pkg = C.buildPackage(inc, { changesOnly: which === 'changes', noPhotos: true, noPatients: true, deviceId: S.settings.deviceId, deviceName: deviceLabel() });
      var count = pkg.entries.length + pkg.revs.length;
      if (!count && which === 'changes') {
        status.textContent = 'Nothing new since the last package file or transfer. Send everything instead.';
        return;
      }
      Promise.all([need('qrcode'), pack(JSON.stringify(pkg))]).then(function (res) {
        var qrcode = res[0];
        var frames = QR.frames(res[1]);
        var i = 0;
        var me = { frames: frames, exportedAt: pkg.exportedAt };
        running = me;
        function show() {
          if (running !== me) return;
          drawFrame(qrcode, frames[i], canvas);
          status.textContent = 'Sending ' + plural(count, 'item', 'items') + ' (' + (which === 'changes' ? 'changes since the last transfer' : 'everything') + ', no photos). Part ' + (i + 1) + ' of ' + frames.length + '.';
          i = (i + 1) % frames.length;
        }
        show();
        me.timer = setInterval(show, +speed.value);
        speed.onchange = function () {
          clearInterval(me.timer);
          me.timer = setInterval(show, +speed.value);
        };
        track('qrSent');
        A.qrLastFrames = frames;
      }).catch(function (err) {
        status.textContent = err.message;
      });
    }
    var changesBtn = btn('Changes since last transfer', function () { start('changes'); }, '', { id: 'qrChanges', disabled: !inc.lastExportAt });
    var fullBtn = btn('Everything', function () { start('full'); }, '', { id: 'qrFull' });
    choose.appendChild(changesBtn);
    choose.appendChild(fullBtn);
    choose.appendChild(speed);
    body.appendChild(choose);
    body.appendChild(status);
    body.appendChild(h('div', { class: 'qr-wrap' }, canvas));
    body.appendChild(h('div', { class: 'row wrap' },
      btn('The other device has it', function () {
        if (running && running.exportedAt) {
          C.markExported(inc, running.exportedAt, { noPhotos: true });
          persist(inc);
        }
        var photosLeft = C.countPending(inc).atts > 0;
        stop();
        A.closePanel();
        render();
        toast(photosLeft ? 'Done. Photos still need to go in a package file.' : 'Marked as shared. The next transfer sends only newer changes.');
      }, '', { id: 'qrDone' })));
    body.appendChild(h('p', { class: 'hint', text: 'Photos are not sent by QR code. Send them later in a package file.' }));
    start(scope);
  }

  /* ---------- receiving ---------- */

  function openQRReceive() {
    stop();
    commitSession('leave');
    var body = openPanel('Receive by QR code');
    var status = h('p', { id: 'qrRecvStatus', role: 'status', text: 'Starting the camera...' });
    var bar = h('div', { class: 'qr-progress', id: 'qrProgress' });
    var video = h('video', { class: 'qr-video', playsinline: true, muted: true, autoplay: true });
    var receiver = new QR.Receiver();
    var finished = false;
    var me = { receiver: receiver };
    running = me;
    body.appendChild(h('p', { text: 'Point this camera at the moving QR code on the other device. Keep both screens bright and steady.' }));
    body.appendChild(status);
    body.appendChild(bar);
    body.appendChild(h('div', { class: 'qr-wrap' }, video));

    function progress(res) {
      bar.textContent = '';
      for (var i = 1; i <= res.parts; i++) {
        bar.appendChild(h('span', { class: 'qr-part' + (res.missing && res.missing.indexOf(i) !== -1 ? '' : ' got') }));
      }
    }

    function feed(text) {
      if (finished) return;
      var res = receiver.add(text);
      if (res.status === 'ignored') return;
      if (res.status === 'bad') {
        status.textContent = 'The parts did not check out. Starting over; keep pointing at the code.';
        return;
      }
      if (res.status === 'restart') status.textContent = 'A new transfer started on the other device.';
      if (res.status === 'complete') {
        finished = true;
        status.textContent = 'All ' + res.parts + ' parts received. Importing...';
        stop();
        unpack(res.payload).then(function (text2) {
          var lines = [];
          return importText(text2, 'QR transfer', lines).then(function () {
            track('qrReceived');
            A.closePanel();
            finishImport(lines);
          });
        }).catch(function (err) {
          status.textContent = 'The transfer could not be read: ' + err.message;
        });
        return;
      }
      status.textContent = 'Received ' + res.have + ' of ' + res.parts + ' parts.';
      progress({ parts: res.parts, missing: receiver.missing() });
    }
    me.feed = feed;
    A.qrFeed = feed;

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      status.textContent = 'This browser cannot use the camera on this page. Open FieldICS from its HTTPS address, or use a package file.';
      return;
    }
    Promise.all([need('jsQR'), navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })]).then(function (res) {
      if (running !== me) {
        res[1].getTracks().forEach(function (t) { t.stop(); });
        return;
      }
      var jsQR = res[0];
      me.stream = res[1];
      video.srcObject = me.stream;
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* autoplay is allowed for muted video */ });
      status.textContent = 'Looking for the QR code...';
      var canvas = document.createElement('canvas');
      var g = canvas.getContext('2d', { willReadFrequently: true });
      var last = 0;
      function tick(t) {
        if (running !== me) return;
        me.raf = requestAnimationFrame(tick);
        if (t - last < 90 || video.readyState < 2) return;
        last = t;
        var w = video.videoWidth;
        var ht = video.videoHeight;
        if (!w || !ht) return;
        var scale = Math.min(1, 900 / Math.max(w, ht));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(ht * scale);
        g.drawImage(video, 0, 0, canvas.width, canvas.height);
        var img = g.getImageData(0, 0, canvas.width, canvas.height);
        var code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) feed(code.data);
      }
      me.raf = requestAnimationFrame(tick);
    }).catch(function (err) {
      status.textContent = (err && err.name === 'NotAllowedError')
        ? 'The camera is blocked for FieldICS. Allow camera access in the browser settings, then try again.'
        : 'The camera could not start: ' + ((err && err.message) || 'unknown error') + '.';
    });
  }

  /* Decodes a QR image (for testing and for a photo of a code). Returns the text or null. */
  function decodeImageData(img) {
    return need('jsQR').then(function (jsQR) {
      var code = jsQR(img.data, img.width, img.height);
      return code ? code.data : null;
    });
  }

  /* ---------- exports ---------- */

  A.openQRSend = openQRSend;
  A.openQRReceive = openQRReceive;
  A.stopQR = stop;
  A.qrPack = pack;
  A.qrUnpack = unpack;
  A.qrDecodeImageData = decodeImageData;
})(window.FieldApp);
