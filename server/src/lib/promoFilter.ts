/**
 * Promotional / deal article detection.
 *
 * Layer 1 (keyword): fast, zero-cost title check run at RSS discover time.
 * Layer 2 (AI):      short classify prompt run inside summarizer for articles
 *                    that pass keywords but still look like product promos.
 */

// ─── Keyword patterns ────────────────────────────────────────────────────────
// Conservative patterns to minimise false positives.
// Each regex targets phrases that almost exclusively appear in deal/affiliate
// articles, not in regular tech/business news.

const PROMO_TITLE_PATTERNS: RegExp[] = [
  // Price / discount signals
  /\b\d+\s*percent\s+off\b/i,
  /\b\d+%\s*off\b/i,
  /\bon sale\s+(for|at|now)\b/i,
  /\balready on sale\b/i,
  /\b(lowest price|all[- ]time low|price drop|price cut)\b/i,
  /\bsave \$\d+/i,
  /\bsave up to \d+/i,

  // Deal / coupon language — allow words between "best/top/..." and "deals"
  /\b(best|top|daily|today'?s|this week'?s)\s+(\w+\s+)?deal[s]?\b/i,
  /\b(coupon|promo code|discount code|voucher)\b/i,
  /\b(clearance|doorbuster)\b/i,

  // Call-to-action
  /\b(buy now|shop now|grab this|order now|get it now)\b/i,

  // Vietnamese deal language
  // Note: \b is ASCII-only in JS and does not work with Vietnamese diacritics.
  // Use (?:^|\s) / (?:\s|$) as Unicode-safe word boundaries instead.
  /(?:^|\s)giảm\s*giá(?:\s|$)/i,
  /(?:^|\s)khuyến\s*m[ãạ]i(?:\s|$)/i,
  /(?:^|\s)mua ngay(?:\s|$)/i,
  /(?:^|\s)giá rẻ nhất(?:\s|$)/i,
  /\bflash sale\b/i,
];

/**
 * Check whether an article title matches any known promo keyword pattern.
 * Returns the matched substring if found, null otherwise.
 */
export function matchPromoKeyword(title: string): string | null {
  for (const pattern of PROMO_TITLE_PATTERNS) {
    const match = title.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/**
 * Quick boolean check — is this title promotional?
 */
export function isPromoTitle(title: string): boolean {
  return matchPromoKeyword(title) !== null;
}

// ─── AI classify prompt ──────────────────────────────────────────────────────

/**
 * Build a very short prompt asking the AI to classify an article as
 * "news" or "promo". Designed for the cheapest/fastest model available.
 */
export function buildPromoClassifyPrompt(title: string, excerpt: string): string {
  return `Classify this article. Is it a real NEWS article, or a PROMOTIONAL/DEAL article (product sale, discount, coupon, affiliate deal, product roundup with buy links)?

Title: ${title}
Excerpt: ${excerpt.substring(0, 400)}

Reply with exactly one word: "news" or "promo"`;
}

/**
 * Parse the AI classification response.
 * Returns true if the article is classified as promotional.
 */
export function isPromoClassification(aiResponse: string): boolean {
  return aiResponse.trim().toLowerCase().startsWith('promo');
}
