'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Facebook, Instagram, Twitter, Linkedin, Youtube, Film, Ghost, MessageCircle, Send } from 'lucide-react';

const KNOWN_PLATFORMS = ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok', 'snapchat', 'whatsapp', 'telegram'];
const PLATFORM_ICONS: Record<string, any> = {
  facebook: Facebook, instagram: Instagram, twitter: Twitter, linkedin: Linkedin,
  youtube: Youtube, tiktok: Film, snapchat: Ghost, whatsapp: MessageCircle, telegram: Send,
};

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function SocialLinksEditor({ value, onChange }: { value: any; onChange: (val: any) => void }) {
  const t = useTranslations('admin.contact');
  const links = Array.isArray(value) ? value : [];
  const [platform, setPlatform] = useState('');
  const [customPlatform, setCustomPlatform] = useState('');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isOther, setIsOther] = useState(false);

  const handleUrlChange = (val: string) => {
    setUrl(val);
    if (val.trim() && !isValidUrl(val)) setUrlError(t('invalidUrl'));
    else setUrlError(null);
  };

  const addLink = () => {
    const finalPlatform = isOther ? customPlatform.trim().toLowerCase() : platform;
    if (!finalPlatform || !url.trim() || !isValidUrl(url.trim())) return;
    const newLink = { platform: finalPlatform, url: url.trim() };
    onChange([...links, newLink]);
    setPlatform(''); setCustomPlatform(''); setUrl(''); setUrlError(null); setIsOther(false);
  };

  const removeLink = (index: number) => {
    const updated = links.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      {links.map((link: any, idx: number) => {
        const Icon = PLATFORM_ICONS[link.platform];
        return (
          <div key={idx} className="flex items-center gap-2">
            {Icon ? <Icon className="w-4 h-4" /> : <span className="w-4 h-4 inline-block" />}
            <span className="w-20 font-medium capitalize">{link.platform}</span>
            <span className="flex-1 text-sm truncate">{link.url}</span>
            <button onClick={() => removeLink(idx)} className="text-red-500 hover:text-red-700">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      })}

      <div className="flex gap-2 items-end flex-wrap">
        <div className="w-32">
          <label className="text-xs">{t('platform')}</label>
          {!isOther ? (
            <Select value={platform} onValueChange={(v) => { if (v === 'other') { setIsOther(true); setPlatform(''); } else { setPlatform(v); } }}>
              <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                {KNOWN_PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                <SelectItem value="other">{t('other')}</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input value={customPlatform} onChange={e => setCustomPlatform(e.target.value)} placeholder={t('customPlatform')} />
          )}
        </div>
        {isOther && (
          <Button variant="outline" size="sm" onClick={() => { setIsOther(false); setPlatform(''); setCustomPlatform(''); }}>
            {t('chooseKnown')}
          </Button>
        )}
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs">{t('url')}</label>
          <Input value={url} onChange={e => handleUrlChange(e.target.value)} placeholder="https://..." className={urlError ? 'border-red-500' : ''} />
          {urlError && <p className="text-red-500 text-xs mt-1">{urlError}</p>}
        </div>
        <Button size="sm" onClick={addLink} disabled={!url.trim() || !isValidUrl(url.trim()) || (!isOther && !platform) || (isOther && !customPlatform.trim())}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}