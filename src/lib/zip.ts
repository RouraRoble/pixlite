/** Build a ZIP of converted files client-side with jszip (lazily loaded). */
import { dedupeNames, sanitizeZipName } from './filename';

export interface ZipEntry {
  name: string;
  blob: Blob;
}

export async function buildZip(entries: ZipEntry[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const names = dedupeNames(entries.map((e) => sanitizeZipName(e.name)));
  entries.forEach((entry, i) => zip.file(names[i], entry.blob));
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}
