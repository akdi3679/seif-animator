'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminPUT, useAdminPOST } from '@/lib/api/hooks';
import { adminAPI } from '@/lib/api/client';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { RetryableError } from '@/components/shared/RetryableError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { toast } from 'sonner';
import { RateLimitError } from '@/lib/api/types';
import { ActionConfirmDialog } from '@/components/admin/ActionConfirmDialog';
import { EmailCodeField } from '@/components/admin/EmailCodeField';
import { z } from 'zod';
import { Eye, Pencil, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const RESET_MS = 120_000;

const maskEmail = (email: string) => {
  if (!email) return '';
  const [name, domain] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(name.length - 2, 1))}@${domain}`;
};

interface SectionProps {
  unlockToken: string | null;
  profile: any;
  onSaved: () => void;
}

// Wrap a send-code trigger so EmailCodeField can show friendly inline errors
function useCodeSender(trigger: (body?: any) => Promise<any>, t: any) {
  return useCallback(async () => {
    try {
      await trigger({});
    } catch (err: any) {
      if (err instanceof RateLimitError) throw new Error(t('rateLimit', { seconds: err.retryAfter }));
      throw new Error(err?.message || t('error'));
    }
  }, [trigger, t]);
}

// ───────────────────────── NAME ─────────────────────────
function ProfileNameSection({ unlockToken, profile, onSaved }: SectionProps) {
  const t = useTranslations('admin.settings');
  const { trigger: updateProfile } = useAdminPUT('/profile', { showToast: false });
  const { trigger: sendCode } = useAdminPOST('/profile/send-code', { showToast: false });
  const sendEmailCode = useCodeSender(sendCode, t);
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [emailCode, setEmailCode] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setFullName(profile?.fullName || ''); }, [profile?.fullName]);

  const isDirty = fullName !== (profile?.fullName || '');
  const valid = fullName.trim().length > 0;
  const canSave = isDirty && valid && emailCode.length === 6;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ fullName: fullName.trim(), emailCode, token: unlockToken });
      toast.success(t('profileUpdated')); setEmailCode(''); onSaved();
    } catch (err: any) { toast.error(err.message || t('error')); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 pt-4">
      <div>
        <label className="text-sm font-medium">{t('fullName')}</label>
        <Input disabled={!unlockToken} value={fullName} onChange={e => setFullName(e.target.value)} />
        {fullName.trim().length === 0 && <p className="text-red-500 text-xs mt-1">{t('fullNameRequired')}</p>}
      </div>
      {unlockToken && (
        <>
          <EmailCodeField onSend={sendEmailCode} disabled={!isDirty || !valid} code={emailCode} onCodeChange={setEmailCode} label={t('emailCode')} sendLabel={t('sendCode')} />
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}{t('save')}
          </Button>
        </>
      )}
    </div>
  );
}

// ───────────────────────── PASSWORD ─────────────────────────
function ProfilePasswordSection({ unlockToken, onSaved }: SectionProps) {
  const t = useTranslations('admin.settings');
  const { trigger: updateProfile } = useAdminPUT('/profile', { showToast: false });
  const { trigger: sendCode } = useAdminPOST('/profile/send-code', { showToast: false });
  const sendEmailCode = useCodeSender(sendCode, t);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);

  const strength = useMemo(() => {
    if (!password) return { level: 0, label: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (score <= 2) return { level: 1, label: t('weak') };
    if (score <= 3) return { level: 2, label: t('good') };
    return { level: 3, label: t('strong') };
  }, [password, t]);

  const match = password === confirmPassword;
  const valid = password.length >= 8 && match;
  const isDirty = password.length > 0;
  const canSave = isDirty && valid && emailCode.length === 6;
  const flashPaste = (e: React.ClipboardEvent) => { e.preventDefault(); setFlash(true); setTimeout(() => setFlash(false), 500); };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ password, emailCode, token: unlockToken });
      toast.success(t('profileUpdated')); setPassword(''); setConfirmPassword(''); setEmailCode(''); onSaved();
    } catch (err: any) { toast.error(err.message || t('error')); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 pt-4">
      <div>
        <label className="text-sm font-medium">{t('newPassword')}</label>
        <Input type="password" disabled={!unlockToken} value={password} onChange={e => setPassword(e.target.value)} onPaste={flashPaste}
          className={flash ? 'border-red-500 transition-colors duration-300' : ''} />
        {password && password.length < 8 && <p className="text-red-500 text-xs mt-1">{t('passwordMin')}</p>}
        {password && (
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1.5 flex-1 rounded-full bg-gray-200">
              <div className={`h-full rounded-full transition-all duration-300 ${strength.level === 1 ? 'w-1/3 bg-red-500' : strength.level === 2 ? 'w-2/3 bg-yellow-500' : 'w-full bg-green-500'}`} />
            </div>
            <span className={`text-xs ${strength.level === 1 ? 'text-red-600' : strength.level === 2 ? 'text-yellow-600' : 'text-green-600'}`}>{strength.label}</span>
          </div>
        )}
      </div>
      <div>
        <label className="text-sm font-medium">{t('confirmPassword')}</label>
        <Input type="password" disabled={!unlockToken} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onPaste={flashPaste}
          className={flash ? 'border-red-500 transition-colors duration-300' : ''} />
        {confirmPassword && !match && <p className="text-red-500 text-xs mt-1">{t('passwordsMismatch')}</p>}
      </div>
      {unlockToken && (
        <>
          <EmailCodeField onSend={sendEmailCode} disabled={!isDirty || !valid} code={emailCode} onCodeChange={setEmailCode} label={t('emailCode')} sendLabel={t('sendCode')} />
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}{t('save')}
          </Button>
        </>
      )}
    </div>
  );
}

// ───────────────────────── EMAIL ─────────────────────────
function ProfileEmailSection({ unlockToken, profile, onSaved }: SectionProps) {
  const t = useTranslations('admin.settings');
  const { trigger: updateProfile } = useAdminPUT('/profile', { showToast: false });
  const { trigger: sendCode } = useAdminPOST('/profile/send-code', { showToast: false });
  const { trigger: sendNewCode } = useAdminPOST('/profile/send-code-new', { showToast: false });
  const sendEmailCode = useCodeSender(sendCode, t);
  const [email, setEmail] = useState(profile?.email || '');
  const [emailCode, setEmailCode] = useState('');
  const [newEmailCode, setNewEmailCode] = useState('');
  const [newEmailCodeSentFor, setNewEmailCodeSentFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setEmail(profile?.email || ''); }, [profile?.email]);

  const dbEmail = profile?.email || '';
  const emailValid = z.string().email().safeParse(email).success;
  const isEmailChanged = emailValid && !!dbEmail && email.toLowerCase() !== dbEmail.toLowerCase();
  const codesValid = emailCode.length === 6 && newEmailCode.length === 6 && newEmailCodeSentFor === email;
  const canSave = isEmailChanged && codesValid;

  const sendNewEmailCode = useCallback(async () => {
    try {
      await sendNewCode({ newEmail: email });
      setNewEmailCodeSentFor(email);
    } catch (err: any) {
      if (err instanceof RateLimitError) throw new Error(t('rateLimit', { seconds: err.retryAfter }));
      throw new Error(err?.message || t('error'));
    }
  }, [sendNewCode, email, t]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ email, emailCode, newEmailCode, token: unlockToken });
      toast.success(t('profileUpdated')); setEmailCode(''); setNewEmailCode(''); setNewEmailCodeSentFor(null); onSaved();
    } catch (err: any) { toast.error(err.message || t('error')); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 pt-4">
      <div>
        <label className="text-sm font-medium">{t('email')}</label>
        <Input disabled={!unlockToken} value={email} onChange={e => setEmail(e.target.value)} />
        {email && !emailValid && <p className="text-red-500 text-xs mt-1">{t('emailInvalid')}</p>}
      </div>

      {unlockToken && isEmailChanged && (
        <>
          <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
  <p className="text-sm text-gray-700">{t('emailChangeNotice')}</p>
  <p className="text-sm font-semibold text-primary">{maskEmail(dbEmail)} → {maskEmail(email)}</p>
    <EmailCodeField onSend={sendEmailCode} code={emailCode} onCodeChange={setEmailCode}
              label={`${t('currentEmailCode')} (${maskEmail(dbEmail)})`} sendLabel={t('sendCodeCurrent')} />
            <EmailCodeField onSend={sendNewEmailCode} code={newEmailCode} onCodeChange={setNewEmailCode}
              label={`${t('newEmailCode')} (${maskEmail(email)})`} sendLabel={t('sendCodeNew')} />
            {newEmailCodeSentFor && newEmailCodeSentFor !== email && (
              <p className="text-amber-600 text-xs">{t('emailChangedResend')}</p>
            )}
          </div>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}{t('save')}
          </Button>
        </>
      )}

      {unlockToken && !isEmailChanged && (
        <p className="text-sm text-gray-400">{t('emailNoChange')}</p>
      )}
    </div>
  );
}

// ───────────────────────── TWO-FACTOR ─────────────────────────
function ProfileTwoFactorSection({ unlockToken, profile, onSaved }: SectionProps) {
  const t = useTranslations('admin.settings');
  const { trigger: updateProfile } = useAdminPUT('/profile', { showToast: false });
  const { trigger: sendCode } = useAdminPOST('/profile/send-code', { showToast: false });
  const sendEmailCode = useCodeSender(sendCode, t);
  const [enabled, setEnabled] = useState(!!profile?.twoFactorEnabled);
  const [emailCode, setEmailCode] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setEnabled(!!profile?.twoFactorEnabled); }, [profile?.twoFactorEnabled]);

  const isDirty = enabled !== !!profile?.twoFactorEnabled;
  const canSave = isDirty && emailCode.length === 6;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ twoFactorEnabled: enabled, emailCode, token: unlockToken });
      toast.success(t('profileUpdated')); setEmailCode(''); onSaved();
    } catch (err: any) { toast.error(err.message || t('error')); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium">{t('twoFactorEnabled')}</label>
          <p className="text-xs text-gray-500">{t('twoFactorHint')}</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" disabled={!unlockToken} checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-green-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
        </label>
      </div>
      {unlockToken && isDirty && (
        <>
          <EmailCodeField onSend={sendEmailCode} code={emailCode} onCodeChange={setEmailCode} label={t('emailCode')} sendLabel={t('sendCode')} />
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}{t('save')}
          </Button>
        </>
      )}
    </div>
  );
}

// ───────────────────────── MAIN ─────────────────────────
export default function UserProfileTab() {
  const t = useTranslations('admin.settings');

  const { data: profile, error: profileError, mutate: refreshProfile, isValidating: profileLoading, retry: profileRetry } = useAdminGETSWR<any>('/profile');
  const { data: secretCodes, error: codesError, mutate: refreshCodes, isValidating: codesLoading, retry: codesRetry } = useAdminGETSWR<any[]>('/secret-codes');

  // Unlock session
  const [unlockToken, setUnlockToken] = useState<string | null>(null);
  const [unlockExpiresAt, setUnlockExpiresAt] = useState<number | null>(null);
  const [unlockCountdown, setUnlockCountdown] = useState('');
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'name' | 'password' | 'email' | 'twofactor'>('name');

  // Secret codes / sensitive config (unchanged behavior)
  const [smtpUser, setSmtpUser] = useState<string | null>(null);
  const [loadingSmtp, setLoadingSmtp] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null);
  const [loadingTelegram, setLoadingTelegram] = useState(false);
  const [showSensitiveVerify, setShowSensitiveVerify] = useState<'smtp' | 'telegram' | null>(null);
  const [sensitiveError, setSensitiveError] = useState<string | null>(null);
  const [showSecretDialog, setShowSecretDialog] = useState(false);
  const [oldSecretCode, setOldSecretCode] = useState('');
  const [newSecretCode, setNewSecretCode] = useState('');
  const [secretEmailCode, setSecretEmailCode] = useState('');
  const [secretSubmitting, setSecretSubmitting] = useState(false);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [revealedCode, setRevealedCode] = useState<string | null>(null);
  const [revealingCode, setRevealingCode] = useState(false);
  const [showRevealVerify, setShowRevealVerify] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  const resetTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const scheduleReset = useCallback((key: string, onReset: () => void) => {
    if (resetTimers.current[key]) clearTimeout(resetTimers.current[key]);
    resetTimers.current[key] = setTimeout(() => { onReset(); delete resetTimers.current[key]; }, RESET_MS);
  }, []);
  useEffect(() => () => { Object.values(resetTimers.current).forEach(clearTimeout); }, []);

  const { trigger: sendCode } = useAdminPOST('/profile/send-code', { showToast: false });
  const sendSecretEmailCode = useCodeSender(sendCode, t);
  const { trigger: updateSecretCode } = useAdminPUT<any, { code: string; emailCode: string; deleteCode: string }>(() => '/secret-codes/lock_delete', { showToast: false });
  const lockCode = secretCodes?.find((c: any) => c.purpose === 'lock_delete');

  // Unlock countdown
  useEffect(() => {
    if (!unlockExpiresAt) return;
    const update = () => {
      const now = Date.now();
      if (now >= unlockExpiresAt) {
        setUnlockToken(null); setUnlockExpiresAt(null); setUnlockCountdown('');
        toast.info(t('unlockExpired')); return;
      }
      const sec = Math.ceil((unlockExpiresAt - now) / 1000);
      setUnlockCountdown(`${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [unlockExpiresAt, t]);

  const handleUnlock = async (deleteCode: string) => {
    setUnlocking(true); setUnlockError(null);
    try {
      const data = await adminAPI<{ token: string; ttlSeconds: number }>('/profile/unlock', { method: 'POST', body: JSON.stringify({ deleteCode }) });
      setUnlockToken(data.token);
      setUnlockExpiresAt(Date.now() + data.ttlSeconds * 1000);
      setShowUnlockDialog(false);
      toast.success(t('profileUnlocked'));
    } catch (err: any) { setUnlockError(err.message || t('error')); }
    finally { setUnlocking(false); }
  };

  const handleSecretSave = async () => {
    if (!oldSecretCode || !newSecretCode || secretEmailCode.length !== 6) { setSecretError(t('allFieldsRequired')); return; }
    setSecretSubmitting(true); setSecretError(null);
    try {
      await updateSecretCode({ code: newSecretCode, emailCode: secretEmailCode, deleteCode: oldSecretCode });
      toast.success(t('codeUpdated')); refreshCodes(); setShowSecretDialog(false);
    } catch (err: any) { setSecretError(err.message || t('error')); }
    finally { setSecretSubmitting(false); }
  };

  const handleSensitiveVerify = async (deleteCode: string) => {
    setSensitiveError(null);
    if (showSensitiveVerify === 'smtp') {
      setLoadingSmtp(true);
      try {
        const data = await adminAPI<{ smtpUser: string }>('/sensitive-config/smtp', { method: 'POST', body: JSON.stringify({ deleteCode }) });
        setSmtpUser(data.smtpUser); scheduleReset('smtp', () => setSmtpUser(null)); setShowSensitiveVerify(null);
      } catch (err: any) { setSensitiveError(err.message || t('error')); }
      finally { setLoadingSmtp(false); }
    } else if (showSensitiveVerify === 'telegram') {
      setLoadingTelegram(true);
      try {
        const data = await adminAPI<{ telegramChatId: string }>('/sensitive-config/telegram', { method: 'POST', body: JSON.stringify({ deleteCode }) });
        setTelegramChatId(data.telegramChatId); scheduleReset('telegram', () => setTelegramChatId(null)); setShowSensitiveVerify(null);
      } catch (err: any) { setSensitiveError(err.message || t('error')); }
      finally { setLoadingTelegram(false); }
    }
  };

  const handleRevealCode = async (deleteCode: string) => {
    setRevealingCode(true); setRevealError(null);
    try {
      const result = await adminAPI<{ code: string }>('/secret-codes/lock_delete/reveal', { method: 'POST', body: JSON.stringify({ deleteCode }) });
      setRevealedCode(result.code); scheduleReset('revealed', () => setRevealedCode(null)); setShowRevealVerify(false);
    } catch (err: any) { setRevealError(err.message || t('error')); }
    finally { setRevealingCode(false); }
  };

  if (profileError) return <RetryableError error={profileError} onRetry={profileRetry} isRetrying={profileLoading} />;
  if (codesError) return <RetryableError error={codesError} onRetry={codesRetry} isRetrying={codesLoading} />;
  if (!profile || !secretCodes) return <LoadingSpinner />;

  const tabs = [
    { id: 'name', label: t('tabName') },
    { id: 'password', label: t('tabPassword') },
    { id: 'email', label: t('tabEmail') },
    { id: 'twofactor', label: t('tabTwoFactor') },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('profileTitle')}</h2>
        <RefreshButton onRefresh={() => { refreshProfile(); refreshCodes(); }} loading={profileLoading || codesLoading} />
      </div>

      {/* Profile card with tabs */}
      <div className="bg-white rounded-2xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{t('profileInfo')}</h3>
          <div className="flex items-center gap-2">
            {unlockCountdown && <span className="text-xs text-orange-600 font-medium">{t('unlockExpiresIn')}: {unlockCountdown}</span>}
            {!unlockToken && (
              <Button onClick={() => { setUnlockError(null); setShowUnlockDialog(true); }} variant="outline">{t('unlockToEdit')}</Button>
            )}
          </div>
        </div>

        {!unlockToken && <p className="text-sm text-gray-500 mb-3">{t('unlockHint')}</p>}

        {/* Tab bar */}
       {/* Tab bar — scrollable, brand purple */}
<div className="tab-bar-scroll">
  <style>{`
    .tab-bar-scroll { overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; }
    .tab-bar-scroll::-webkit-scrollbar { display: none; }
  `}</style>
  <div className="flex gap-2 min-w-max">
    {tabs.map(tab => (
      <button
        key={tab.id}
        onClick={() => setActiveTab(tab.id)}
        className={`px-5 py-2 text-sm font-semibold rounded-full whitespace-nowrap transition-all duration-200 ${
          activeTab === tab.id
            ? 'bg-primary text-dark shadow-md'
            : 'text-gray-500 hover:bg-primary/10 hover:text-primary'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
</div>

        {activeTab === 'name' && <ProfileNameSection unlockToken={unlockToken} profile={profile} onSaved={refreshProfile} />}
        {activeTab === 'password' && <ProfilePasswordSection unlockToken={unlockToken} profile={profile} onSaved={refreshProfile} />}
        {activeTab === 'email' && <ProfileEmailSection unlockToken={unlockToken} profile={profile} onSaved={refreshProfile} />}
        {activeTab === 'twofactor' && <ProfileTwoFactorSection unlockToken={unlockToken} profile={profile} onSaved={refreshProfile} />}
      </div>

      {/* Secret codes section (unchanged) */}
      <div className="bg-white rounded-2xl border p-6">
        <h3 className="font-semibold mb-4">{t('secretsTitle')}</h3>

        {lockCode && (
          <div className="flex items-center justify-between border-b pb-3 mb-3">
            <div>
              <p className="font-medium">{t('lockDeleteCode')}</p>
              <p className="text-sm text-gray-500">{revealedCode ? <span className="font-mono">{revealedCode}</span> : '••••••'}</p>
              {lockCode.updated_at && <p className="text-xs text-gray-400">{t('lastUpdated')}: {new Date(lockCode.updated_at).toLocaleString()}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setRevealError(null); setShowRevealVerify(true); }} disabled={revealingCode}>
                {revealingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setOldSecretCode(''); setNewSecretCode(''); setSecretEmailCode(''); setSecretError(null); setShowSecretDialog(true); }}>
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-b pb-3 mb-3">
          <div><p className="font-medium">SMTP</p><p className="text-sm text-gray-500">{smtpUser || '••••••'}</p></div>
          <Button variant="outline" size="sm" onClick={() => { setSensitiveError(null); setShowSensitiveVerify('smtp'); }} disabled={loadingSmtp}>
            {loadingSmtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div><p className="font-medium">Telegram</p><p className="text-sm text-gray-500">{telegramChatId || '••••••'}</p></div>
          <Button variant="outline" size="sm" onClick={() => { setSensitiveError(null); setShowSensitiveVerify('telegram'); }} disabled={loadingTelegram}>
            {loadingTelegram ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Dialogs */}
      <ActionConfirmDialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog} onConfirm={handleUnlock}
        title={t('unlockProfileTitle')} description={t('enterDeleteCodeToUnlock')} confirmLabel={t('confirm')} loading={unlocking} error={unlockError} />

      <Dialog open={showSecretDialog} onOpenChange={setShowSecretDialog}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>{t('editSecretCode')}</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">{t('editSecretCodeDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="text" placeholder={t('currentCode')} value={oldSecretCode} onChange={e => setOldSecretCode(e.target.value)} />
            <Input type="text" placeholder={t('newCode')} value={newSecretCode} onChange={e => setNewSecretCode(e.target.value)} />
            <EmailCodeField onSend={sendSecretEmailCode} code={secretEmailCode} onCodeChange={setSecretEmailCode}
              disabled={!newSecretCode.trim()} label={t('emailCode')} sendLabel={t('sendCode')} />
            {secretError && <p className="text-red-500 text-sm">{secretError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSecretDialog(false)}>{t('cancel')}</Button>
              <Button onClick={handleSecretSave} disabled={secretSubmitting || !oldSecretCode || !newSecretCode || secretEmailCode.length !== 6}>
                {secretSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}{t('save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ActionConfirmDialog open={showRevealVerify} onOpenChange={setShowRevealVerify} onConfirm={handleRevealCode}
        title={t('revealCode')} description={t('enterDeleteCode')} confirmLabel={t('confirm')} loading={revealingCode} error={revealError} />

      <ActionConfirmDialog open={!!showSensitiveVerify} onOpenChange={open => { if (!open) setShowSensitiveVerify(null); }}
        onConfirm={handleSensitiveVerify} title={t('viewSensitiveConfig')} description={t('enterDeleteCode')}
        confirmLabel={t('confirm')} loading={loadingSmtp || loadingTelegram} error={sensitiveError} />
    </div>
  );
}