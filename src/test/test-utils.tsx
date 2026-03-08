import { render, RenderOptions } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactElement, ReactNode } from "react";
import { vi } from "vitest";

// Mock auth context values
export const mockUser = {
  id: "user-1",
  email: "test@test.com",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: { display_name: "Test User" },
  created_at: "2024-01-01",
};

export const mockProfile = {
  id: "profile-1",
  user_id: "user-1",
  display_name: "Test User",
  avatar: "😎",
  phone: null,
};

export const mockRoom = {
  id: "room-1",
  name: "Test Room",
  invite_code: "ABC123",
  created_by: "user-1",
};

export const mockAuthContext = {
  user: mockUser as any,
  session: { access_token: "token", user: mockUser } as any,
  profile: mockProfile,
  currentRoom: mockRoom,
  userRooms: [mockRoom],
  loading: false,
  isSoloMode: false,
  signUp: vi.fn().mockResolvedValue({ error: null }),
  signIn: vi.fn().mockResolvedValue({ error: null }),
  signOut: vi.fn().mockResolvedValue(undefined),
  createRoom: vi.fn().mockResolvedValue({ room: mockRoom, error: null }),
  joinRoom: vi.fn().mockResolvedValue({ error: null }),
  leaveRoom: vi.fn().mockResolvedValue({ error: null }),
  setCurrentRoom: vi.fn(),
  switchRoom: vi.fn(),
  toggleSoloMode: vi.fn(),
  refreshProfile: vi.fn().mockResolvedValue(undefined),
  refreshRooms: vi.fn().mockResolvedValue(undefined),
};

// Mock the AuthContext module
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuthContext,
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Mock supabase client
export const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  single: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  channel: vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }),
  removeChannel: vi.fn(),
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  },
  functions: {
    invoke: vi.fn(),
  },
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabase,
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export * from "@testing-library/react";
