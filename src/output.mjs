export const OUTPUTS = {
  '9:16': { width: 1080, height: 1920 },
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
};
export const DEFAULT_OUTPUT = '9:16';

const accepted = () => Object.entries(OUTPUTS).map(([name, o]) => `${name} (${o.width}x${o.height})`).join(', ');

export function resolveOutput(value) {
  if (value == null) value = DEFAULT_OUTPUT;
  const key = typeof value === 'string' ? value.trim().toLowerCase().replace('×', 'x') : null;
  const name = Object.keys(OUTPUTS).find(n => n === key || `${OUTPUTS[n].width}x${OUTPUTS[n].height}` === key);
  if (!name) throw new Error(`unknown output ${JSON.stringify(value)}. Use ${accepted()}.`);
  return { name, ...OUTPUTS[name] };
}
