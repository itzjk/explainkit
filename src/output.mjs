// Scenes always draw the 1080x1920 stage. An output is the part of it that ends up in the video: 4:5 and 1:1 are
// centered crops, and the label, captions and pulse monitor are drawn on the cropped frame at the Y values below.
// Scenes are composed around captions at stage row 1395, so captions keep that row in 4:5; in 1:1 they sit 80 px above
// the bottom edge instead. With no room under the captions in the feed sizes, the pulse monitor takes the top right corner.
export const STAGE = { width: 1080, height: 1920 };

export const OUTPUTS = {
  '9:16': { width: 1080, height: 1920, labelY: 300, captionY: 1395, pulseY: 1700 },
  '4:5': { width: 1080, height: 1350, labelY: 220, captionY: 1110, pulseY: 44 },
  '1:1': { width: 1080, height: 1080, labelY: 220, captionY: 936, pulseY: 44 },
};
export const DEFAULT_OUTPUT = '9:16';

// How far each overlay element reaches above and below its Y, measured from overlay.js: the label box is 132 high with a
// 5 px outline, captions are at most 96 px with a 16 px outline and a 1.12 pop, the pulse monitor hangs 86 px below its Y.
export const EXTENT = {
  label: { above: 70, below: 70 },
  caption: { above: 64, below: 64 },
  pulse: { above: 0, below: 86 },
};

const accepted = () => Object.entries(OUTPUTS).map(([name, o]) => `${name} (${o.width}x${o.height})`).join(', ');

export function resolveOutput(value) {
  if (value == null) value = DEFAULT_OUTPUT;
  const key = typeof value === 'string' ? value.trim().toLowerCase().replace('×', 'x') : null;
  const name = Object.keys(OUTPUTS).find(n => n === key || `${OUTPUTS[n].width}x${OUTPUTS[n].height}` === key);
  if (!name) throw new Error(`unknown output ${JSON.stringify(value)}. Use ${accepted()}.`);
  return { name, ...OUTPUTS[name] };
}

function placed(key, given, output, element, fallback) {
  if (given == null) return fallback;
  const lowest = output.height - EXTENT[element].below, highest = EXTENT[element].above;
  if (typeof given !== 'number' || !(given >= highest && given <= lowest)) {
    throw new Error(`${key} ${JSON.stringify(given)} does not fit a ${output.width}x${output.height} frame. Use a number from ${highest} to ${lowest} (pixels from the top), or leave it out for ${fallback}.`);
  }
  return given;
}

export function layoutFor(value, { labelY = null, captionY = null } = {}) {
  const output = resolveOutput(value);
  return {
    name: output.name,
    width: output.width,
    height: output.height,
    cropY: (STAGE.height - output.height) / 2,
    labelY: placed('labelY', labelY, output, 'label', output.labelY),
    captionY: placed('captionY', captionY, output, 'caption', output.captionY),
    pulseY: output.pulseY,
  };
}
