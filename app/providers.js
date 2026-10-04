'use client';

// Client-only context wrapper. QueryClient is created once at module load.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/components/tc/AuthContext';
import { CartProvider } from '@/components/tc/CartContext';
import { TryOnSettingsProvider } from '@/components/tc/TryOnSettingsContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <TryOnSettingsProvider>{children}</TryOnSettingsProvider>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
