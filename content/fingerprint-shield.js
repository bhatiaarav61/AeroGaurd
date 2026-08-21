// Injected into MAIN World at document_start
(() => {
  'use strict';

  // 1. Canvas Fingerprint Noise Injection
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

  HTMLCanvasElement.prototype.toDataURL = function (type, ...args) {
    const ctx = this.getContext('2d');
    if (ctx) {
      const imgData = ctx.getImageData(0, 0, Math.max(1, this.width), Math.max(1, this.height));
      for (let i = 0; i < imgData.data.length; i += 64) {
        imgData.data[i] = imgData.data[i] ^ 1; // Subtle non-visual bit shift
      }
      ctx.putImageData(imgData, 0, 0);
    }
    return originalToDataURL.apply(this, [type, ...args]);
  };

  CanvasRenderingContext2D.prototype.getImageData = function (x, y, w, h, ...args) {
    const res = originalGetImageData.apply(this, [x, y, w, h, ...args]);
    for (let i = 0; i < res.data.length; i += 128) {
      res.data[i] = res.data[i] ^ 1;
    }
    return res;
  };

  // 2. WebGL Hardware Masking
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (parameter) {
    // UNMASKED_VENDOR_WEBGL
    if (parameter === 0x9245) return 'Intel Inc.';
    // UNMASKED_RENDERER_WEBGL
    if (parameter === 0x9246) return 'Intel Iris OpenGL Engine';
    return getParameter.apply(this, [parameter]);
  };

  // 3. AudioContext Phase-Shift Noise
  if (window.AudioBuffer) {
    const origGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function (channel) {
      const buffer = origGetChannelData.apply(this, [channel]);
      for (let i = 0; i < buffer.length; i += 500) {
        buffer[i] += 0.0000001; // Imperceptible micro-noise
      }
      return buffer;
    };
  }
})();