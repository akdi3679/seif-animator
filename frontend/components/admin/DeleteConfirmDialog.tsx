'use client';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react'; 
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (code: string) => void;
  error?: string | null;
  loading?: boolean;   // new
}


export function DeleteConfirmDialog({ open, onOpenChange, onConfirm, error, loading }: Props) {
  const t = useTranslations('admin');
  const [code, setCode] = useState('');

  const handleConfirm = () => {
    onConfirm(code);
    setCode('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle>{t('deleteConfirm.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-500">{t('deleteConfirm.instruction')}</p>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('deleteConfirm.placeholder')}
          autoFocus
        />
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('deleteConfirm.cancel')}
          </Button>
         <Button
  variant="destructive"
  onClick={handleConfirm}
  disabled={!code.trim() || loading}
  className="bg-red-600 hover:bg-red-700 text-white"
>
  {loading ? (
    <>
      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      {t('deleteConfirm.sending')}
    </>
  ) : (
    t('deleteConfirm.confirm')
  )}
</Button>        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}