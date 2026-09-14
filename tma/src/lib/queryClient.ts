import { QueryClient } from "@tanstack/react-query";

// Один кэш для приложения и границы сессии: при выходе личные данные
// должны исчезать до того, как другой аккаунт откроет любой экран.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
