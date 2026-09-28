'use client';
import { useEffect, useState, useRef } from 'react';
import { Wifi, WifiOff, Loader2, Copy, Check } from 'lucide-react';
import { adminAPI } from '@/lib/api/client';
import { useTailscaleHealth } from '@/components/providers/TailscaleGateProvider';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function TailscaleStatus({ collapsed = false, tailscaleIp = null, ipLoading = false }: {
  collapsed?: boolean;
  tailscaleIp?: string | null;
  ipLoading?: boolean;
}) {
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
 
  const [hoverOpen, setHoverOpen] = useState(false);
  const { healthy } = useTailscaleHealth();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
 
  // Connection status
  useEffect(() => {
    adminAPI('/health')
      .then(() => setConnected(true))
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  }, []);

  // Tailscale IP
 

 const copyIp = () => {
    if (tailscaleIp) { navigator.clipboard.writeText(tailscaleIp); toast.success('IP copied'); }
  };


  if (loading || ipLoading) return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;
  if (healthy === null) return null;

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        className="p-1 hover:bg-gray-100 rounded"
        onMouseEnter={() => setHoverOpen(true)}
        onMouseLeave={() => setHoverOpen(false)}
      >
        {healthy ? (
          <Wifi className="w-4 h-4 text-green-400" />
        ) : (
          <WifiOff className="w-4 h-4 text-red-400" />
        )}
      </button>

      {hoverOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-1 z-50 w-56 p-3 text-sm bg-white border border-gray-200 shadow-lg rounded-md"
          onMouseEnter={() => setHoverOpen(true)}
          onMouseLeave={() => setHoverOpen(false)}
        >
          <p className="font-medium mb-1">
            {healthy ? 'Tailscale Connected' : 'Tailscale Disconnected'}
          </p>
          {tailscaleIp ? (
            <div className="flex items-center justify-between gap-1 text-gray-500">
              <span className="font-mono">{tailscaleIp}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyIp}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <p className="text-xs text-gray-400">IP unavailable</p>
          )}
        </div>
      )}
    </div>
  );
}