import { adminAPI } from '@/lib/api/client';

export async function translateText(text: string, from: string, to: string): Promise<string> {
  if (!text) return '';
  
  // Use MyMemory Translation API (free, no key required for limited use)
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.responseData.translatedText || text;
  } catch (error) {
    console.error('Translation failed:', error);
    return text; // fallback to original
  }
}
export async function translateBatch(texts: string[], targetLang: string, sourceLang: string): Promise<string[]> {
  const res = await adminAPI<{ translated: string[] }>('/translate', {
    method: 'POST',
    body: JSON.stringify({ texts, targetLang, sourceLang }),
  });
  return res.translated;
}export async function deleteCloudinaryImage(publicId: string): Promise<void> {
  await adminAPI(`/cloudinary/${publicId}`, { method: 'DELETE' });
}