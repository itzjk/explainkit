// Caption files. The renderer burns prepare().caps into the video; these functions write those same captions, with the
// same text and the same times, as files that a platform or an editor can open.
//   SubRip (.srt)  numbered cues, "00:00:01,500 --> 00:00:03,000"; no standard exists, this is what almost every tool reads
// Every format starts from cues(), the one place that turns captions into whole milliseconds and clean text lines.

const pad = (n, width = 2) => String(n).padStart(width, '0');
const LINE_BREAK = /\r\n|[\n\r\u2028\u2029]/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g; // control characters (C0, DEL, C1) except tab and the line breaks above

// seconds -> whole milliseconds. Times before 0 start at 0, as the renderer does (it never draws a frame before 0).
function toMs(seconds, what) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) throw new Error(`${what} is not a finite number of seconds: ${seconds}`);
  return Math.max(0, Math.round(seconds * 1000));
}

// whole milliseconds -> "HH:MM:SS<sep>mmm". Hours keep counting past 99 instead of wrapping.
function stamp(ms, sep) {
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

// "00:01:02,500" (the SubRip comma). Rounds once, on the whole time in milliseconds, so 59.9996 s is 00:01:00,000
// and never 00:00:59,1000.
export function timestamp(seconds, sep = ',') {
  return stamp(toMs(seconds, 'timestamp'), sep);
}

// a caption's text as clean lines: one line per line break, no control characters, and no empty lines (a blank line
// ends a cue in every subtitle format)
const textLines = txt => String(txt ?? '').replace(CONTROL, '').split(LINE_BREAK).map(l => l.trim()).filter(Boolean);

// The cues every format shares, in whole milliseconds and in start order. A caption is left out when it has no text or
// lasts less than a millisecond: WebVTT needs every cue to end after it starts, and such a cue would flash for no time.
export function cues(caps) {
  const list = [];
  caps.forEach((c, i) => {
    const start = toMs(c.s, `caption ${i + 1} start`), end = toMs(c.e, `caption ${i + 1} end`), lines = textLines(c.txt);
    if (end > start && lines.length) list.push({ start, end, lines });
  });
  return list.sort((a, b) => a.start - b.start);
}

// SubRip: "1", the times with a comma, the text, then a blank line. UTF-8, LF line breaks, numbered from 1 without gaps.
export function toSrt(caps) {
  return cues(caps).map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.lines.join('\n')}\n\n`).join('');
}
