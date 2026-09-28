'use client';
import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface EmailCodeFieldProps {
  onSend: () => Promise<void>;
  code: string;
  onCodeChange: (code: string) => void;
  cooldownSeconds?: number;
  disabled?: boolean;          // disables the SEND button (e.g. no real change yet)
  error?: string | null;       // inline error from the parent (e.g. wrong code on save)
  label?: string;
  sendLabel?: string;
}

export function EmailCodeField({
  onSend,
  code,
  onCodeChange,
  cooldownSeconds = 60,
  disabled = false,
  error = null,
  label = 'Code de vérification',
  sendLabel = 'Envoyer le code',
}: EmailCodeFieldProps) {
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);

  // Visible countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown(c => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleSend = useCallback(async () => {
    setLocalError(null);
    setSending(true);
    try {
      await onSend();
      setCooldown(cooldownSeconds);   // start visible cooldown on success
    } catch (err: any) {
      setLocalError(err?.message || "Échec de l'envoi du code");
    } finally {
      setSending(false);
    }
  }, [onSend, cooldownSeconds]);

  const sendDisabled = disabled || sending || cooldown > 0;
  const displayError = error || localError;

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <Input
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="______"
          value={code}
          onChange={e => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="tracking-widest text-center font-mono"
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleSend}
          disabled={sendDisabled}
          className="whitespace-nowrap min-w-[120px]"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : cooldown > 0 ? `${cooldown}s` : sendLabel}
        </Button>
      </div>
      {displayError && <p className="text-red-500 text-xs">{displayError}</p>}
    </div>
  );
}