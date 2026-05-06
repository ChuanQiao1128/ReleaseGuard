export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_/-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}
