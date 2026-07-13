function normalizeGrounding(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Only persist model-extracted customer details when the value is present in
 * the current customer-authored text. This prevents an ungrounded model guess
 * from silently becoming durable profile data. */
export function isGroundedProfileValue(
  value: string | null | undefined,
  currentMessage: string
): value is string {
  if (!value?.trim()) return false;
  const normalizedValue = normalizeGrounding(value);
  const normalizedMessage = normalizeGrounding(currentMessage);
  return normalizedValue.length > 0 && normalizedMessage.includes(normalizedValue);
}
