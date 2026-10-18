import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry on 4xx client errors (e.g. 401, 404, 422)
        if (typeof error === 'object' && error !== null && 'statusCode' in error) {
          const status = (error as { statusCode: number }).statusCode;
          if (status >= 400 && status < 500) {
            return false;
          }
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
