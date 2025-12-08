import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  avatar: string;
  phone: string | null;
}

interface Room {
  id: string;
  name: string;
  invite_code: string;
  created_by: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  currentRoom: Room | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  createRoom: (name: string) => Promise<{ room: Room | null; error: Error | null }>;
  joinRoom: (inviteCode: string) => Promise<{ error: Error | null }>;
  setCurrentRoom: (room: Room | null) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    
    if (data && !error) {
      setProfile(data as Profile);
    }
  };

  const fetchUserRoom = async (userId: string) => {
    const { data: membership } = await supabase
      .from("room_members")
      .select("room_id, rooms(*)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (membership?.rooms) {
      setCurrentRoom(membership.rooms as unknown as Room);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
            fetchUserRoom(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setCurrentRoom(null);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchUserRoom(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName,
        }
      }
    });
    
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setCurrentRoom(null);
  };

  const createRoom = async (name: string) => {
    if (!user) return { room: null, error: new Error("Not authenticated") };

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .insert({ name, created_by: user.id })
      .select()
      .single();

    if (roomError || !room) {
      return { room: null, error: roomError as Error };
    }

    const { error: memberError } = await supabase
      .from("room_members")
      .insert({ room_id: room.id, user_id: user.id, role: "admin" });

    if (memberError) {
      return { room: null, error: memberError as Error };
    }

    setCurrentRoom(room as Room);
    return { room: room as Room, error: null };
  };

  const joinRoom = async (inviteCode: string) => {
    if (!user) return { error: new Error("Not authenticated") };

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("invite_code", inviteCode.toUpperCase())
      .maybeSingle();

    if (roomError || !room) {
      return { error: new Error("Invalid invite code") };
    }

    const { error: memberError } = await supabase
      .from("room_members")
      .insert({ room_id: room.id, user_id: user.id, role: "member" });

    if (memberError) {
      if (memberError.code === "23505") {
        return { error: new Error("You're already a member of this room") };
      }
      return { error: memberError as Error };
    }

    setCurrentRoom(room as Room);
    return { error: null };
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        currentRoom,
        loading,
        signUp,
        signIn,
        signOut,
        createRoom,
        joinRoom,
        setCurrentRoom,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
