import * as cheerio from 'cheerio';
import { callAi } from '../ai-client.js';
import { truncate } from '../../lib/utils.js';
import {
  extractWithSelectorProfile,
  isExtractionUsable,
  normalizeSelectorProfile,
  NormalizedSelectorProfile,
  SelectorExtractionResult,
} from './selector-profile.js';

export interface LearnedSelectorResult {
  profile: NormalizedSelectorProfile;
  extraction: SelectorExtractionResult;
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function cleanHtmlForLearning(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, svg').remove();
  return truncate($.html().replace(/<!--([\s\S]*?)-->/g, '').replace(/\s+/g, ' ').trim(), 30000);
}

function buildSelectorLearningPrompt(pageUrl: string, html: string): string {
  return `Infer robust CSS selectors for extracting the main article content from this HTML page.

Return ONLY one valid JSON object, no markdown fences:
{
  "contentSelectors": ["specific article body selector", "backup selector"],
  "removeSelectors": ["ads/noise selector"],
  "titleSelector": "optional title selector or null",
  "imageSelector": "optional main image selector or null",
  "publishedAtSelector": "optional date selector or null"
}

Rules:
- contentSelectors must target article body containers, most specific first.
- Do not use generic selectors: html, body, *, main, article, [role="main"].
- Prefer stable class/id/attribute selectors.
- removeSelectors should remove ads, navigation, sidebars, related posts, comments, sharing widgets, newsletter blocks.
- Keep selector count small: max 8 contentSelectors and max 20 removeSelectors.
- Do not invent selectors absent from the HTML.

URL: ${pageUrl}

HTML:
${html}`;
}

export async function learnSelectorProfileFromHtml(pageUrl: string, html: string): Promise<LearnedSelectorResult | null> {
  const cleanedHtml = cleanHtmlForLearning(html);
  const output = await callAi(buildSelectorLearningPrompt(pageUrl, cleanedHtml), { max_tokens: 1200, temperature: 0.1 });
  const parsed = JSON.parse(stripMarkdownFence(output));
  const profile = normalizeSelectorProfile(parsed);
  if (!profile) return null;

  const extraction = extractWithSelectorProfile(html, pageUrl, profile);
  if (!isExtractionUsable(extraction.content, profile.minTextLength)) return null;

  return { profile, extraction };
}
