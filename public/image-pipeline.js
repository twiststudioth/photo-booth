// GPU (WebGL) image adjustments.
// The same shader renders the live camera preview and the captured photo,
// so the photo matches exactly what the preview shows.

const ADJUST_CAPTURE_WIDTH = 2400;
const ADJUST_CAPTURE_HEIGHT = 1600;
const ADJUST_ASPECT = ADJUST_CAPTURE_WIDTH / ADJUST_CAPTURE_HEIGHT; // 3:2

const FILTER_PRESET_IDS = {
  none: 0,
  bw: 1,
  sepia: 2,
  vintage: 3,
  cool: 4,
  warm: 5,
  brighten: 6,
  soft: 7,
  film: 8,
  pink: 9,
  vivid: 10
};

const ADJUST_VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const ADJUST_FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vUv;
uniform sampler2D uImage;
uniform vec2 uCropOffset;   // 3:2 center crop of the source (texture uv)
uniform vec2 uCropScale;
uniform vec2 uUnit;         // 1 pixel of the 2400x1600 output, in texture uv
uniform float uBrightness;  // -0.5..0.5
uniform float uContrast;    // -0.5..0.5
uniform float uSaturation;  // -1..1
uniform float uShadows;     // -0.5..0.5
uniform float uHighlights;  // -0.5..0.5
uniform float uTemperature; // -0.5..0.5 (negative = cooler, positive = warmer)
uniform float uSharpness;   // -1..1
uniform float uBeauty;      // 0..1
uniform int uFilter;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

vec3 sampleAt(vec2 uv) {
  return texture2D(uImage, uv).rgb;
}

vec3 saturateColor(vec3 c, float amount) {
  return mix(vec3(dot(c, LUMA)), c, amount);
}

vec3 sCurve(vec3 c) {
  return c * c * (3.0 - 2.0 * c);
}

vec3 sepiaTone(vec3 c) {
  return vec3(
    dot(c, vec3(0.393, 0.769, 0.189)),
    dot(c, vec3(0.349, 0.686, 0.168)),
    dot(c, vec3(0.272, 0.534, 0.131))
  );
}

// Soft skin-tone mask from YCbCr (Cb 77-127, Cr 133-173 on 0-255 scale)
float skinMask(vec3 c) {
  float y = dot(c, LUMA);
  float cb = 0.5 - 0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b;
  float cr = 0.5 + 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b;
  float m = smoothstep(0.28, 0.31, cb) * (1.0 - smoothstep(0.49, 0.52, cb))
          * smoothstep(0.50, 0.53, cr) * (1.0 - smoothstep(0.67, 0.70, cr));
  return m * smoothstep(0.08, 0.2, y);
}

// Beauty: edge-preserving (bilateral) smoothing on skin only,
// so eyes, brows, hair and background edges stay sharp
vec3 beautify(vec2 uv, vec3 c, vec3 base) {
  float mask = skinMask(c) * uBeauty;
  if (mask <= 0.001) return base;

  float radius = 4.0 + 10.0 * uBeauty;
  float lc = dot(c, LUMA);
  vec3 sum = c;
  float weightSum = 1.0;

  for (int ring = 1; ring <= 2; ring++) {
    float r = radius * float(ring) * 0.5;
    float ringWeight = ring == 1 ? 1.0 : 0.6;
    for (int i = 0; i < 8; i++) {
      float angle = float(i) * 0.785398 + float(ring) * 0.392699;
      vec3 s = sampleAt(uv + vec2(cos(angle), sin(angle)) * r * uUnit);
      float d = dot(s, LUMA) - lc;
      float w = ringWeight * exp(-d * d / 0.006);
      sum += s * w;
      weightSum += w;
    }
  }

  vec3 smoothed = sum / weightSum;
  vec3 result = mix(base, smoothed, mask * 0.85);
  // Gentle glow on skin
  return result + (1.0 - result) * 0.06 * mask;
}

vec3 applyPreset(vec3 c) {
  if (uFilter == 1) return vec3(dot(c, LUMA));                           // bw
  if (uFilter == 2) return sepiaTone(c);                                 // sepia
  if (uFilter == 3) return mix(c, sepiaTone(c), 0.5) * 0.9;              // vintage
  if (uFilter == 4) return saturateColor(c * vec3(0.93, 1.0, 1.08), 1.05); // cool
  if (uFilter == 5) return saturateColor(mix(c, sepiaTone(c), 0.3), 1.15); // warm
  if (uFilter == 6) {                                                    // brighten (lift without clipping)
    c = pow(c, vec3(0.75));
    return saturateColor(mix(c, sCurve(c), 0.15), 0.92);
  }
  if (uFilter == 7) {                                                    // soft
    c = saturateColor(c, 0.85) * 0.88 + 0.08;
    return c * vec3(1.02, 1.0, 0.98);
  }
  if (uFilter == 8) {                                                    // film (faded + split tone)
    float l = dot(c, LUMA);
    c = c * 0.9 + 0.05;
    c += vec3(-0.02, 0.01, 0.03) * (1.0 - l) + vec3(0.04, 0.02, -0.03) * l;
    return saturateColor(c, 0.9);
  }
  if (uFilter == 9) {                                                    // pink
    c = pow(c, vec3(0.92));
    return c + vec3(0.05, -0.01, 0.03) * (1.0 - dot(c, LUMA) * 0.5);
  }
  if (uFilter == 10) return saturateColor(mix(c, sCurve(c), 0.2), 1.3);  // vivid
  return c;
}

void main() {
  vec2 uv = uCropOffset + vUv * uCropScale;
  vec3 c = sampleAt(uv);
  vec3 base = c;

  // Sharpness (+) / softness (-)
  if (uSharpness != 0.0) {
    vec3 n = sampleAt(uv + vec2(uUnit.x, 0.0)) + sampleAt(uv - vec2(uUnit.x, 0.0))
           + sampleAt(uv + vec2(0.0, uUnit.y)) + sampleAt(uv - vec2(0.0, uUnit.y));
    if (uSharpness > 0.0) {
      base = c + uSharpness * (4.0 * c - n);
    } else {
      base = mix(c, n * 0.25, -uSharpness);
    }
  }

  if (uBeauty > 0.0) {
    base = beautify(uv, c, base);
  }

  c = clamp(base, 0.0, 1.0);
  c = clamp(applyPreset(c), 0.0, 1.0);

  // White balance
  c = clamp(c * vec3(1.0 + 0.2 * uTemperature, 1.0 + 0.02 * uTemperature, 1.0 - 0.2 * uTemperature), 0.0, 1.0);

  // Shadows / highlights (smooth zones, no banding)
  float l = dot(c, LUMA);
  if (uShadows != 0.0) {
    c *= 1.0 + uShadows * 1.5 * (1.0 - smoothstep(0.0, 0.66, l));
  }
  if (uHighlights != 0.0) {
    float w = smoothstep(0.33, 1.0, l);
    if (uHighlights > 0.0) {
      c = 1.0 - (1.0 - c) * (1.0 - uHighlights * 0.8 * w);
    } else {
      c *= 1.0 + uHighlights * 0.6 * w;
    }
  }
  c = clamp(c, 0.0, 1.0);

  // Brightness as gamma: brighter/darker without clipping whites or crushing blacks
  if (uBrightness != 0.0) {
    c = pow(c, vec3(exp2(-uBrightness * 1.2)));
  }

  // Contrast: S-curve up, flatten down
  if (uContrast > 0.0) {
    c = mix(c, sCurve(c), uContrast * 2.0);
  } else if (uContrast < 0.0) {
    c = mix(c, vec3(0.5), -uContrast);
  }

  // Saturation: vibrance-style boost (dull colors more, skin less)
  if (uSaturation > 0.0) {
    float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    float amount = uSaturation * (1.0 - sat * 0.6) * (1.0 - 0.4 * skinMask(c));
    c = saturateColor(c, 1.0 + amount);
  } else if (uSaturation < 0.0) {
    c = saturateColor(c, 1.0 + uSaturation);
  }

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

const ADJUST_UNIFORMS = [
  'uImage', 'uCropOffset', 'uCropScale', 'uUnit', 'uBrightness', 'uContrast', 'uSaturation',
  'uShadows', 'uHighlights', 'uTemperature', 'uSharpness', 'uBeauty', 'uFilter'
];

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

// Create a renderer on a canvas. Returns null when WebGL is unavailable.
function createAdjustmentRenderer(canvas, options = {}) {
  const attrs = {
    alpha: false,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: !!options.preserveDrawingBuffer
  };

  let gl = null;
  try {
    gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
  } catch (error) {
    gl = null;
  }
  if (!gl) return null;

  let uniforms = null;

  // (Re)create GPU resources - also used after the context is restored
  function setup() {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, ADJUST_VERTEX_SHADER);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, ADJUST_FRAGMENT_SHADER);
    if (!vertex || !fragment) return false;

    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);

    // Full-screen quad
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    // Source texture (camera frame); clamp + linear works for non-power-of-2 sizes
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    uniforms = {};
    ADJUST_UNIFORMS.forEach(name => {
      uniforms[name] = gl.getUniformLocation(program, name);
    });
    gl.uniform1i(uniforms.uImage, 0);
    return true;
  }

  if (!setup()) return null;

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    uniforms = null;
  });
  canvas.addEventListener('webglcontextrestored', setup);

  return {
    // Draw a 3:2 center crop of `source` with `adjustments` onto the canvas.
    // Returns false when nothing could be drawn.
    render(source, sourceWidth, sourceHeight, adjustments) {
      if (!uniforms || gl.isContextLost() || !sourceWidth || !sourceHeight) return false;

      // Same crop as object-fit: cover on a 3:2 box
      const sourceAspect = sourceWidth / sourceHeight;
      const scaleX = sourceAspect > ADJUST_ASPECT ? ADJUST_ASPECT / sourceAspect : 1;
      const scaleY = sourceAspect > ADJUST_ASPECT ? 1 : sourceAspect / ADJUST_ASPECT;

      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
      } catch (error) {
        return false; // frame not ready yet
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.uCropOffset, (1 - scaleX) / 2, (1 - scaleY) / 2);
      gl.uniform2f(uniforms.uCropScale, scaleX, scaleY);
      gl.uniform2f(uniforms.uUnit, scaleX / ADJUST_CAPTURE_WIDTH, scaleY / ADJUST_CAPTURE_HEIGHT);
      gl.uniform1f(uniforms.uBrightness, (adjustments.brightness || 0) / 100);
      gl.uniform1f(uniforms.uContrast, (adjustments.contrast || 0) / 100);
      gl.uniform1f(uniforms.uSaturation, (adjustments.saturation || 0) / 100);
      gl.uniform1f(uniforms.uShadows, (adjustments.shadows || 0) / 100);
      gl.uniform1f(uniforms.uHighlights, (adjustments.highlights || 0) / 100);
      gl.uniform1f(uniforms.uTemperature, (adjustments.temperature || 0) / 100);
      gl.uniform1f(uniforms.uSharpness, (adjustments.sharpness || 0) / 100);
      gl.uniform1f(uniforms.uBeauty, (adjustments.beauty || 0) / 100);
      gl.uniform1i(uniforms.uFilter, FILTER_PRESET_IDS[adjustments.filter] || 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return true;
    }
  };
}
