export function generateDocumentNumber(prefix: string) {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${timestamp}-${random}`;
}
