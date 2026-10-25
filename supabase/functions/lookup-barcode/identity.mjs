export function canonicalNewBarcode(barcode) {
  if (!/^\d{12}$/.test(barcode)) return barcode;
  const body = barcode.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const fromRight = body.length - 1 - i;
    sum += Number(body[i]) * (fromRight % 2 === 0 ? 3 : 1);
  }
  if (String((10 - (sum % 10)) % 10) !== barcode.at(-1)) return barcode;
  return `0${barcode}`;
}

export function barcodeCandidates(barcode) {
  if (typeof barcode !== 'string' || !/^\d{12,13}$/.test(barcode)) return [barcode];
  const canonical = canonicalNewBarcode(barcode);
  if (canonical.length === 13 && canonical.startsWith('0')) return [canonical, canonical.slice(1)];
  return [barcode];
}

export async function insertLookupItemOrReturnWinner(item, repo) {
  try {
    const saved = await repo.insert(item);
    if (!saved?.id) throw new Error('lookup insert returned no persisted row');
    return { item: saved, inserted: true };
  } catch (error) {
    if (error?.code !== '23505') throw error;
    const rows = await repo.findByBarcodes(barcodeCandidates(item.barcode));
    const unique = [...new Map(rows.map(row => [row.id, row])).values()];
    if (unique.length === 1) return { item: unique[0], inserted: false };
    throw new Error('lookup insert conflict did not resolve to one persisted barcode row');
  }
}
