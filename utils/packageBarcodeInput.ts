// Preserve leading zeros and leave canonicalization/catalog identity to lookup-barcode.
// Accept package EAN-8/UPC-E, UPC-A, EAN-13 and GTIN-14 digit formats.
export function packageBarcodeInput(value: string): string | null {
  const barcode=value.trim();
  return /^(?:\d{8}|\d{12,14})$/.test(barcode) ? barcode : null;
}
