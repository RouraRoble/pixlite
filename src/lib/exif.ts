/** Reads EXIF/GPS metadata client-side with `exifr` (lazily loaded, MIT-licensed). */

export interface FileMetadata {
  hasGps: boolean;
  lat: number | null;
  lon: number | null;
  camera: string | null;
  takenAt: string | null;
}

const EMPTY: FileMetadata = { hasGps: false, lat: null, lon: null, camera: null, takenAt: null };

export async function readFileMetadata(file: File): Promise<FileMetadata> {
  try {
    const exifr = await import('exifr');
    const [gps, tags] = await Promise.all([
      exifr.gps(file).catch(() => null),
      exifr.parse(file, { pick: ['Make', 'Model', 'DateTimeOriginal', 'CreateDate'] }).catch(() => null),
    ]);
    const camera = tags ? [tags.Make, tags.Model].filter(Boolean).join(' ').trim() || null : null;
    const dateVal = tags?.DateTimeOriginal ?? tags?.CreateDate ?? null;
    const takenAt = dateVal instanceof Date ? dateVal.toISOString() : typeof dateVal === 'string' ? dateVal : null;
    if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
      return { hasGps: true, lat: gps.latitude, lon: gps.longitude, camera, takenAt };
    }
    return { ...EMPTY, camera, takenAt };
  } catch {
    return EMPTY;
  }
}
