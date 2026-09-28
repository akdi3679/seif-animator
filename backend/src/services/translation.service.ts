// src/services/translation.service.ts

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const LANGBLY_API_KEY = process.env.LANGBLY_API_KEY ?? '';
const LANGBLY_URL = 'https://api.langbly.com/language/translate/v2';
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

const MAX_CONCURRENT = 3;      // Max concurrent translation requests
const MAX_RETRIES = 3;         // Max retries per request
const RETRY_DELAY_MS = 600;    // Base delay in ms (exponential backoff)

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isEmpty(text: string | null | undefined): boolean {
  return !text || text.trim() === '';
}

async function readErrorBody(response: Response, service: string): Promise<void> {
  try {
    const body = await response.text();
    console.error(`❌ [${service}] HTTP ${response.status}: ${body.substring(0, 200)}`);
  } catch {
    console.error(`❌ [${service}] HTTP ${response.status}: <unreadable body>`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. LANGBLY (primary)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translate a single text using Langbly API.
 * Returns translated string or null on failure.
 */
async function translateWithLangbly(text: string, targetLang: string): Promise<string | null> {
  if (!LANGBLY_API_KEY) {
    console.warn('⚠️  [Langbly] LANGBLY_API_KEY not set – skipping Langbly');
    return null;
  }

  const body = {
    q: text,
    target: targetLang,     // 'fr' or 'ar'
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(LANGBLY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LANGBLY_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        const wait = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`⚠️  [Langbly] Rate limited (429), retrying in ${wait}ms...`);
        await delay(wait);
        continue;
      }

      if (!response.ok) {
        await readErrorBody(response, `Langbly attempt ${attempt}`);
        if (attempt === MAX_RETRIES) return null;
        await delay(RETRY_DELAY_MS * attempt);
        continue;
      }

      const data: any = await response.json();
      const translated = data?.data?.translations?.[0]?.translatedText;
      if (translated && typeof translated === 'string') {
        return translated.trim();
      }
      console.warn(`⚠️  [Langbly] Unexpected response shape:`, data);
      return null;
    } catch (err) {
      console.warn(`⚠️  [Langbly] Network error (attempt ${attempt}):`, err);
      if (attempt === MAX_RETRIES) return null;
      await delay(RETRY_DELAY_MS * attempt);
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MYMEMORY (fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translate a single text using MyMemory API.
 * Returns translated string or null on failure.
 */
async function translateWithMyMemory(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string | null> {
  const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
   for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        await readErrorBody(response, `MyMemory attempt ${attempt}`);
        if (attempt === MAX_RETRIES) return null;
        await delay(RETRY_DELAY_MS * attempt);
        continue;
      }
      const data: any = await response.json();
      const translated = data?.responseData?.translatedText;
      if (translated && translated !== text) {
        return translated.trim();
      }
      return null;
    } catch (err) {
      console.warn(`⚠️  [MyMemory] Network error (attempt ${attempt}):`, err);
      if (attempt === MAX_RETRIES) return null;
      await delay(RETRY_DELAY_MS * attempt);
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH PROCESSING (with concurrency control)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process an array of texts in parallel with a maximum concurrency limit.
 * Each text is translated individually using the provided translator function.
 */
async function batchProcess(
  texts: (string | null)[],
  targetLang: string,
  translator: (text: string, lang: string) => Promise<string | null>
): Promise<string[]> {
  const nonEmptyIndices: number[] = [];
  const nonEmptyTexts: string[] = [];
  texts.forEach((t, i) => {
    if (!isEmpty(t)) {
      nonEmptyIndices.push(i);
      nonEmptyTexts.push(t as string);
    }
  });

  if (nonEmptyTexts.length === 0) {
    return texts.map(() => '');
  }

  const results: (string | null)[] = new Array(nonEmptyTexts.length).fill(null);
  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < nonEmptyTexts.length) {
      const idx = currentIndex++;
      results[idx] = await translator(nonEmptyTexts[idx], targetLang);
    }
  };

  const workers = Array(MAX_CONCURRENT).fill(null).map(() => worker());
  await Promise.all(workers);

  const allSucceeded = results.every(r => r !== null);
  if (!allSucceeded) {
    console.warn(`⚠️  Batch processing with ${translator.name} had failures.`);
    return [];
  }

  // Re‑expand to original array
  const finalResult: string[] = new Array(texts.length).fill('');
  for (let i = 0; i < nonEmptyIndices.length; i++) {
    finalResult[nonEmptyIndices[i]] = results[i] as string;
  }
  return finalResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translate an array of texts (null/empty allowed) to targetLang.
 * Fallback chain: Langbly → MyMemory → original text.
 */
export async function batchTranslate(
  texts: (string | null)[],
  targetLang: string,
  sourceLang: string
): Promise<string[]> {
  // 1. Langbly (uses its own key)
  let result = await batchProcess(texts, targetLang, translateWithLangbly);
  if (result.length > 0) {
    console.log(`✅ [Langbly] Batch translation succeeded → ${targetLang}`);
    return result;
  }
  console.warn(`⚠️ Langbly failed → ${targetLang}. Trying MyMemory…`);

  // 2. MyMemory – needs source language, not 'auto'
  const myMemoryTranslator = (text: string, lang: string) =>
    translateWithMyMemory(text, sourceLang, lang);
  result = await batchProcess(texts, targetLang, myMemoryTranslator);
  if (result.length > 0) {
    console.log(`✅ [MyMemory] Batch translation succeeded → ${targetLang}`);
    return result;
  }
  console.warn(`⚠️ MyMemory also failed → ${targetLang}. Keeping original texts.`);

  return texts.map(t => (isEmpty(t) ? '' : (t as string)));
}