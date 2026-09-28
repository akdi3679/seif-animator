// app/[locale]/(auth)/layout.tsx
'use client';
import { ErrorHandler } from '@/components/providers/ErrorHandler';
import { useSession } from '@/components/providers/SessionProvider';
import { SessionProvider } from '@/components/providers/SessionProvider'; 
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthLayoutInner>{children}</AuthLayoutInner>
    </SessionProvider>
  );
}
function AuthLayoutInner({ children }: { children: React.ReactNode }) {
  const { loading, user } = useSession();
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-cream z-50">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Already authenticated – redirect handled by SessionProvider's useEffect
  if (user) return null;

  return <ErrorHandler>{children}</ErrorHandler>;
}