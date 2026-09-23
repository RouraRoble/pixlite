import { describe, expect, it } from 'vitest';
import { buildOsmLink, formatCoords, gpsRevealShareText } from '../../src/lib/gps';

describe('buildOsmLink', () => {
  it('builds an OpenStreetMap link with lat/lon', () => {
    const url = buildOsmLink(48.8584, 2.2945);
    expect(url).toContain('openstreetmap.org');
    expect(url).toContain('mlat=48.858400');
    expect(url).toContain('mlon=2.294500');
  });
});

describe('formatCoords', () => {
  it('formats with hemisphere letters', () => {
    expect(formatCoords(48.8584, 2.2945)).toBe('48.8584°N, 2.2945°E');
    expect(formatCoords(-33.8688, -151.2093)).toBe('33.8688°S, 151.2093°W');
  });
});

describe('gpsRevealShareText', () => {
  it('never includes raw coordinates', () => {
    const text = gpsRevealShareText(3);
    expect(text).not.toMatch(/\d+\.\d+,\s*-?\d+\.\d+/);
    expect(text).toContain('3 photos');
  });
  it('uses singular phrasing for one file', () => {
    expect(gpsRevealShareText(1)).toContain('a photo');
  });
});
