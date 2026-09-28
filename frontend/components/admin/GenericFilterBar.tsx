'use client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X } from 'lucide-react';

export interface FilterOption {
  key: string;
  label: string;
}

export interface SelectFilter {
  key: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

export interface DateFilter {
  key: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  // optional – if provided, disallow setting end before start
  minDate?: string;
}

export interface SearchFilter {
  key: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

interface ActiveFilter {
  key: string;
  label: string;
}

interface GenericFilterBarProps {
  selectFilters: SelectFilter[];
  dateFilters: DateFilter[];
  searchFilter: SearchFilter;
  activeFilters: ActiveFilter[];
  onApply: () => void;
  onClear: () => void;
  onRemoveFilter: (key: string) => void;
  t: (key: string) => string;
   dateRangeError?: string | null; 
}

export function GenericFilterBar({
  selectFilters,
  dateFilters,
  searchFilter,
  activeFilters,
  onApply,
  onClear,
  onRemoveFilter,
  t,
   dateRangeError
}: GenericFilterBarProps) {
  return (
    <div className="space-y-4">
      {/* Filter controls */}
      <div className="flex flex-wrap gap-4 items-end bg-white p-4 rounded-2xl border">
        {selectFilters.map((filter) => (
          <div key={filter.key}>
            <label className="text-sm font-medium">{filter.label}</label>
            <Select value={filter.value} onValueChange={filter.onChange}>
              <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('all')}</SelectItem>
                {filter.options.map((opt) => (
                  <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}

        {dateFilters.map((filter) => (
          <div key={filter.key}>
            <label className="text-sm font-medium">{filter.label}</label>
            <Input
              type="date"
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              min={filter.minDate}
            />
          </div>
        ))}
         {dateRangeError && (
          <p className="text-red-500 text-xs w-full">{dateRangeError}</p>
        )}

        <div className="flex items-end gap-2">
          <div>
            <label className="text-sm font-medium">{searchFilter.label}</label>
            <Input
              placeholder={searchFilter.placeholder}
              value={searchFilter.value}
              onChange={(e) => searchFilter.onChange(e.target.value)}
              className="w-48"
            />
          </div>
          <Button onClick={onApply} size="sm">
            <Search className="w-4 h-4 mr-1" /> {t('apply')}
          </Button>
        </div>

        <Button variant="outline" onClick={onClear} size="sm">{t('reset')}</Button>
      </div>

      {/* Active filter badges */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((f) => (
            <Badge
              key={f.key}
              variant="secondary"
              className="pr-1 cursor-pointer"
              onClick={() => onRemoveFilter(f.key)}
            >
              {f.label}
              <X className="w-3 h-3 ml-1" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}