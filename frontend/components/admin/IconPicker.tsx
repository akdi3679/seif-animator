'use client';
import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { icons } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

const ALL_ICONS = Object.keys(icons) as Array<keyof typeof icons>;

export function IconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations('admin');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredIcons = useMemo(() => {
    if (!search.trim()) return ALL_ICONS.slice(0, 150);
    return ALL_ICONS.filter(name => name.toLowerCase().includes(search.toLowerCase()));
  }, [search]);

  const SelectedIcon = value ? (LucideIcons as any)[value] : null;

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    setSearch('');
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between border-gray-300 bg-white hover:bg-gray-50 focus:ring-2 focus:ring-primary/20"
        >
          <span className="flex items-center gap-2 text-gray-700">
            {SelectedIcon ? (
              <>
                <SelectedIcon className="w-5 h-5 text-primary" />
                <span>{value}</span>
              </>
            ) : (
              <span className="text-gray-400">{t('iconPicker.placeholder')}</span>
            )}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-80 p-0 bg-white border border-gray-200 shadow-xl rounded-lg"
        align="start"
        sideOffset={4}
      >
        {/* Search input */}
        <div className="flex items-center border-b border-gray-200 px-3 bg-white rounded-t-lg">
          <Search className="w-4 h-4 text-gray-400 mr-2 shrink-0" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('iconPicker.search')}
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 h-10"
          />
        </div>

        {/* Scrollable icon list */}
        <div className="max-h-72 overflow-y-auto py-2 bg-white rounded-b-lg">
          {filteredIcons.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">{t('iconPicker.empty')}</p>
          )}
          {filteredIcons.map(name => {
            const Icon = (LucideIcons as any)[name];
            return (
              <button
                key={name}
                type="button"
                onClick={() => handleSelect(name)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors rounded-md"
              >
                {Icon && <Icon className="w-5 h-5 text-gray-600" />}
                <span>{name}</span>
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}