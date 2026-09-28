'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface ActionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (code: string) => Promise<void>;
  title: string;
  description: string;
  confirmLabel: string;
  loading?: boolean;
  error?: string | null;
}

export function ActionConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel,
  loading = false,
  error = null,
}: ActionConfirmDialogProps) {
  const [code, setCode] = useState('');

  const handleConfirm = async () => {
    await onConfirm(code);
    setCode(''); // reset for next use
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            type="text"
            placeholder="Entrez le code de validation"
            value={code}
            onChange={e => setCode(e.target.value)}
            disabled={loading}
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Annuler
            </Button>
            <Button onClick={handleConfirm} disabled={loading || !code.trim()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}