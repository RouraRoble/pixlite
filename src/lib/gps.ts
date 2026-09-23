/** Pure helpers for the GPS-reveal feature (no network calls — links only). */

export function buildOsmLink(lat: number, lon: number, zoom = 15): string {
  const la = lat.toFixed(6);
  const lo = lon.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=${zoom}/${la}/${lo}`;
}

export function formatCoords(lat: number, lon: number, precision = 4): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(precision)}°${ns}, ${Math.abs(lon).toFixed(precision)}°${ew}`;
}

/** Text used for the "share what was found" moment — deliberately omits raw coordinates. */
export function gpsRevealShareText(fileCount: number): string {
  return fileCount === 1
    ? `Pixlite found a hidden location in a photo I was about to share — removed it before sending, nothing uploaded.`
    : `Pixlite found hidden locations in ${fileCount} photos I was about to share — removed them before sending, nothing uploaded.`;
}
