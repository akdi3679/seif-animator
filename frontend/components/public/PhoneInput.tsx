'use client';

import { memo, useState, useEffect, useRef } from 'react';
import {
  defaultCountries,
  parseCountry,
  FlagImage,
  usePhoneInput,
} from 'react-international-phone';
import 'react-international-phone/style.css';
import { getCachedGeo } from '@/lib/hooks/useGeoLocation';
interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  error?: string;
  placeholder?: string;  
}

const ALLOWED_COUNTRIES = ['tn', 'fr', 'dz', 'ma', 'ly', 'it', 'es', 'de', 'gb'];

const countries = defaultCountries.filter((country) => {
  const { iso2 } = parseCountry(country);
  return ALLOWED_COUNTRIES.includes(iso2);
});

export const PhoneInput = memo(function PhoneInputComponent({
  value,
  onChange,
  onBlur,
  onFocus,
  error,
  placeholder,
}: PhoneInputProps) {
  const [mounted, setMounted] = useState(false);
  const [defaultCountry, setDefaultCountry] = useState<string>('tn');
  const [isFocused, setIsFocused] = useState(false);
  // Track if geo-detection has run so we don't override a restored value
  const detectionDone = useRef(false);

  const phoneInput = usePhoneInput({
    defaultCountry,
    value,
    countries,
    onChange: (data) => {
      onChange(data.phone);
    },
    // Disable the library's own validation console output
    disableDialCodeAndIsoCodePrefill: false,
  });

  // Geo-detect country only on first mount and only if no value is already set
  useEffect(() => {
    if (detectionDone.current) return;
    detectionDone.current = true;

    // If a value is already provided (restored session), skip detection
    if (value && value.length > 2) return;

    const detect = async () => {
      try {
    const geo = await getCachedGeo();   // from our new hook
    if (geo?.country) {
      const code = geo.country.toLowerCase();
      if (ALLOWED_COUNTRIES.includes(code)) {
        setDefaultCountry(code);
        phoneInput.setCountry(code);
      }
    }
  } catch {
        // Silent – fall back to 'tn'
      }
    };

    detect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
  };

  if (!mounted) {
    return <div className="h-12 w-full animate-pulse bg-gray-100 rounded-2xl" />;
  }

  const selectedCountry = phoneInput.country;

  return (
    <div className="space-y-2">
      {/* Label rendered by parent via Controller, but we add one here for standalone use */}
      <div
        className={`
          w-full rounded-2xl border transition-all
          ${isFocused ? 'border-gray-400 ring-1 ring-gray-400' : error ? 'border-red-400' : 'border-gray-200'}
        `}
      >
        <div className="flex items-center w-full">
          {/* Country Selector */}
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-2 pl-3 pr-2 py-3 h-full rounded-l-2xl hover:bg-gray-50 transition"
              onClick={phoneInput.onCountrySelectorOpen}
              onFocus={handleFocus}
              onBlur={handleBlur}
              aria-label="Select country"
            >
              <FlagImage iso2={selectedCountry.iso2} size="24px" />
              <span className="text-sm font-medium">{selectedCountry.iso2.toUpperCase()}</span>
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {phoneInput.isCountrySelectorOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-50 max-h-64 overflow-y-auto">
                {countries.map((c) => {
                  const country = parseCountry(c);
                  return (
                    <button
                      key={country.iso2}
                      type="button"
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition"
                      onClick={() => {
                        phoneInput.setCountry(country.iso2);
                        phoneInput.onCountrySelectorClose();
                      }}
                    >
                      <FlagImage iso2={country.iso2} size="20px" />
                      <span className="flex-1 text-left">{country.name}</span>
                      <span className="text-gray-400 text-sm">+{country.dialCode}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Phone number input */}
         <input
  type="tel"
  name="phone"
  autoComplete="tel"
  value={phoneInput.inputValue}
  onChange={phoneInput.handlePhoneValueChange}
  onFocus={handleFocus}
  onBlur={handleBlur}
  className="flex-1 p-3 pl-2 bg-transparent outline-none ring-0 rounded-r-2xl"
  placeholder={placeholder || `+${selectedCountry.dialCode} ...`}
/>
   </div>
      </div>

      {/* Error rendered only when parent passes it (i.e. after blur in the parent) */}
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
});