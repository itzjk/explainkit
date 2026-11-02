// Meta's Ads Guide for Instagram Reels ads ("Awareness Image Ad Specs on Instagram Reels",
// https://www.facebook.com/business/ads-guide/update/image/instagram-reels, read 2026-11-01) says to leave roughly 14% of
// the top, 35% of the bottom and 6% on each side of the asset free from text. It gives percentages only, so the pixels are
// computed from them in guideRects. They describe Reels ads, which carry ad copy and a call to action in the bottom band.
// Not verified: that organic Reels, TikTok or YouTube Shorts cover the same bands. TikTok publishes its In-Feed safe zone as
// template files with no numbers (https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads, read 2026-11-01), and no
// official pixel figures for YouTube Shorts were found.
export const UI_ZONES = { top: 0.14, bottom: 0.35, side: 0.06 };

export function guideRects(layout) {
  if (layout.name !== '9:16') throw new Error(`guides draw the zones of full screen vertical players, so they need the 9:16 output (this project renders ${layout.name})`);
  const { width, height } = layout;
  const top = Math.round(height * UI_ZONES.top), bottom = Math.round(height * UI_ZONES.bottom), side = Math.round(width * UI_ZONES.side);
  return [
    { name: 'top', label: `TOP ${Math.round(UI_ZONES.top * 100)}%`, x: 0, y: 0, width, height: top },
    { name: 'bottom', label: `BOTTOM ${Math.round(UI_ZONES.bottom * 100)}%`, x: 0, y: height - bottom, width, height: bottom },
    { name: 'left', x: 0, y: top, width: side, height: height - top - bottom },
    { name: 'right', x: width - side, y: top, width: side, height: height - top - bottom },
  ];
}
