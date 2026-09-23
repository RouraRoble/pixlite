/** Filename helpers: extension mapping, collision-safe de-duplication. */

export function replaceExtension(filename: string, newExt: string): string {
  const ext = newExt.replace(/^\./, '');
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return `${base}.${ext}`;
}

/** Given a list of desired output names (in order), append " (2)", " (3)"... on collisions. */
export function dedupeNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    return `${base} (${count})${ext}`;
  });
}

/** Sanitize a filename for use inside a ZIP archive (strip path separators & control chars). */
export function sanitizeZipName(name: string): string {
  return name.replace(/[\\/]+/g, '-').replace(/[\u0000-\u001f]/g, '').trim() || 'file';
}
