import 'dotenv/config';
import { createHash } from 'crypto';
import { supabase } from '../lib/supabase.js';
import { batchTranslate } from './translation.service.js';

const CAL_API_KEY = process.env.CAL_API_KEY;
const CAL_API_URL = 'https://api.cal.com/v2/event-types';

// Helper: create a hash of all relevant fields to detect any change
function createDataHash(event: any): string {
  const relevantData = {
    title: event.title,
    description: event.description,
    lengthInMinutes: event.lengthInMinutes,
    price: event.price,
    currency: event.currency,
    locations: event.locations,
    requiresConfirmation: event.requiresConfirmation,
    slug: event.slug,
  };
  return createHash('md5').update(JSON.stringify(relevantData)).digest('hex');
}

export async function syncCalEventTypes() {
  if (!CAL_API_KEY) {
    console.error('❌ CAL_API_KEY not set in environment');
    return;
  }

  try {
    console.log('🔄 Syncing Cal.com event types...');
    const response = await fetch(CAL_API_URL, {
      headers: {
        'Authorization': `Bearer ${CAL_API_KEY}`,
        'cal-api-version': '2024-06-14',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Cal.com API error: ${response.status} ${response.statusText}`);
    }

    const { data: eventTypes } = await response.json() as { data: any[] };
    console.log(`📦 Fetched ${eventTypes.length} event types from Cal.com`);

    // 1. Determine which event types have changed (by hash)
    const changedEvents = [];
    for (const event of eventTypes) {
      const newHash = createDataHash(event);
      const { data: existing } = await supabase
        .from('ServiceType')
        .select('calcom_data_hash')
        .eq('calcom_id', event.id)
        .maybeSingle();

      if (!existing || existing.calcom_data_hash !== newHash) {
        changedEvents.push(event);
      }
    }

    if (changedEvents.length === 0) {
      console.log('✅ No changes detected, nothing to sync.');
      return;
    }

    console.log(`📝 ${changedEvents.length} event types changed, collecting texts for translation...`);

    // 2. Prepare arrays for batch translation (titles + descriptions)
    const textsToTranslate: (string | null)[] = [];
    const metadata: { eventIdx: number; type: 'title' | 'description' }[] = [];

    for (let idx = 0; idx < changedEvents.length; idx++) {
      const event = changedEvents[idx];
      textsToTranslate.push(event.title);
      metadata.push({ eventIdx: idx, type: 'title' });
      if (event.description && event.description.trim() !== '') {
        textsToTranslate.push(event.description);
        metadata.push({ eventIdx: idx, type: 'description' });
      } else {
        textsToTranslate.push(null);
        metadata.push({ eventIdx: idx, type: 'description' });
      }
    }

    const nonEmptyCount = textsToTranslate.filter(t => t !== null).length;
    console.log(`🔄 Translating ${nonEmptyCount} texts to French...`);
    const frenchTranslations = await batchTranslate(textsToTranslate, 'fr');
    console.log(`🔄 Translating ${nonEmptyCount} texts to Arabic...`);
    const arabicTranslations = await batchTranslate(textsToTranslate, 'ar');

    // 3. Build the translated values for each event
    const translatedEvents = changedEvents.map((event, idx) => {
      // Find the indices of this event's title and description in the metadata array
      const titleMetaIdx = metadata.findIndex(m => m.eventIdx === idx && m.type === 'title');
      const descMetaIdx = metadata.findIndex(m => m.eventIdx === idx && m.type === 'description');

      const nameFr = frenchTranslations[titleMetaIdx] || event.title;
      const nameAr = arabicTranslations[titleMetaIdx] || event.title;
      let descriptionFr = null;
      let descriptionAr = null;
      if (event.description && descMetaIdx !== -1) {
        descriptionFr = frenchTranslations[descMetaIdx] || event.description;
        descriptionAr = arabicTranslations[descMetaIdx] || event.description;
      }

      const newHash = createDataHash(event);
      return {
        calcom_id: event.id,
        name_fr: nameFr,
        name_ar: nameAr,
        slug: event.slug,
        calcom_slug: event.slug,
        description_fr: descriptionFr,
        description_ar: descriptionAr,
        duration_minutes: event.lengthInMinutes,
        price: event.price || 0,
        currency: event.currency || 'usd',
        locations: event.locations,
        requires_confirmation: event.requiresConfirmation || false,
        is_active: true,
        calcom_title: event.title,
        calcom_description: event.description || null,
        calcom_data_hash: newHash,
        calcom_updated_at: new Date().toISOString(),
        translated_at: new Date().toISOString(),
      };
    });

    // 4. Upsert each event
    let upserted = 0;
    for (const ev of translatedEvents) {
      const { error } = await supabase
        .from('ServiceType')
        .upsert(ev, { onConflict: 'calcom_id' });

      if (error) {
        console.error(`❌ Failed to upsert event type ${ev.slug}:`, error);
      } else {
        upserted++;
        console.log(`✅ Upserted "${ev.calcom_title}" (${ev.slug})`);
      }
    }

    console.log(`✅ Sync completed: ${changedEvents.length} changes, ${upserted} upserted.`);
  } catch (error) {
    console.error('❌ Failed to sync Cal.com event types:', error);
    throw error;
  }
}