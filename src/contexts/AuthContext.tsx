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
  userRooms: Room[];
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  createRoom: (name: string) => Promise<{ room: Room | null; error: Error | null }>;
  joinRoom: (inviteCode: string) => Promise<{ error: Error | null }>;
  leaveRoom: () => Promise<{ error: Error | null }>;
  setCurrentRoom: (room: Room | null) => void;
  switchRoom: (room: Room) => void;
  refreshProfile: () => Promise<void>;
  refreshRooms: () => Promise<void>;
}

const LAST_ROOM_KEY = 'roommate_last_room_id';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [userRooms, setUserRooms] = useState<Room[]>([]);
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

  const fetchUserRooms = async (userId: string) => {
    const { data: memberships } = await supabase
      .from("room_members")
      .select("room_id, rooms(*)")
      .eq("user_id", userId);

    if (memberships && memberships.length > 0) {
      const rooms = memberships
        .map(m => m.rooms as unknown as Room)
        .filter(Boolean);
      
      setUserRooms(rooms);

      // Get last active room from localStorage
      const lastRoomId = localStorage.getItem(LAST_ROOM_KEY);
      
      // Try to restore last active room, otherwise use first room
      let roomToSet: Room | null = null;
      
      if (lastRoomId) {
        roomToSet = rooms.find(r => r.id === lastRoomId) || null;
      }
      
      if (!roomToSet && rooms.length > 0) {
        roomToSet = rooms[0];
      }
      
      if (roomToSet) {
        setCurrentRoom(roomToSet);
        localStorage.setItem(LAST_ROOM_KEY, roomToSet.id);
      }
    } else {
      setUserRooms([]);
      setCurrentRoom(null);
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
            fetchUserRooms(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setCurrentRoom(null);
          setUserRooms([]);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchUserRooms(session.user.id);
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
    setUserRooms([]);
    localStorage.removeItem(LAST_ROOM_KEY);
  };

  const createRoom = async (name: string) => {
    if (!user) return { room: null, error: new Error("Not authenticated") };

    try {
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .insert({ name, created_by: user.id })
        .select()
        .single();

      if (roomError) {
        console.error("Room creation error:", roomError);
        return { room: null, error: new Error(roomError.message || "Failed to create room") };
      }

      if (!room) {
        return { room: null, error: new Error("Room was not created") };
      }

      const { error: memberError } = await supabase
        .from("room_members")
        .insert({ room_id: room.id, user_id: user.id, role: "admin" });

      if (memberError) {
        console.error("Member creation error:", memberError);
        // Try to clean up the room if member creation fails
        await supabase.from("rooms").delete().eq("id", room.id);
        return { room: null, error: new Error(memberError.message || "Failed to add you to the room") };
      }

      const newRoom = room as Room;
      setCurrentRoom(newRoom);
      setUserRooms(prev => [...prev, newRoom]);
      localStorage.setItem(LAST_ROOM_KEY, newRoom.id);
      
      return { room: newRoom, error: null };
    } catch (err) {
      console.error("Unexpected error creating room:", err);
      return { room: null, error: new Error("An unexpected error occurred") };
    }
  };

  const joinRoom = async (inviteCode: string) => {
    if (!user) return { error: new Error("Not authenticated") };

    try {
      // Use secure function to lookup room by invite code (prevents enumeration)
      const { data: rooms, error: roomError } = await supabase
        .rpc('lookup_room_by_invite_code', { code: inviteCode.trim() });

      if (roomError) {
        console.error("Room lookup error:", roomError);
        return { error: new Error("Failed to find room") };
      }

      const room = rooms?.[0];
      if (!room) {
        return { error: new Error("Invalid invite code. Please check and try again.") };
      }

      // Check if already a member
      const { data: existingMember } = await supabase
        .from("room_members")
        .select("id")
        .eq("room_id", room.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingMember) {
        // Already a member - just set the room
        const newRoom = room as Room;
        setCurrentRoom(newRoom);
        if (!userRooms.find(r => r.id === newRoom.id)) {
          setUserRooms(prev => [...prev, newRoom]);
        }
        localStorage.setItem(LAST_ROOM_KEY, newRoom.id);
        return { error: null };
      }

      const { error: memberError } = await supabase
        .from("room_members")
        .insert({ room_id: room.id, user_id: user.id, role: "member" });

      if (memberError) {
        console.error("Join room error:", memberError);
        return { error: new Error(memberError.message || "Failed to join room") };
      }

      const newRoom = room as Room;
      setCurrentRoom(newRoom);
      setUserRooms(prev => [...prev, newRoom]);
      localStorage.setItem(LAST_ROOM_KEY, newRoom.id);
      
      return { error: null };
    } catch (err) {
      console.error("Unexpected error joining room:", err);
      return { error: new Error("An unexpected error occurred") };
    }
  };

  const leaveRoom = async () => {
    if (!user || !currentRoom) return { error: new Error("Not in a room") };

    try {
      const { error } = await supabase
        .from("room_members")
        .delete()
        .eq("user_id", user.id)
        .eq("room_id", currentRoom.id);

      if (error) {
        console.error("Leave room error:", error);
        return { error: new Error(error.message || "Failed to leave room") };
      }

      const leftRoomId = currentRoom.id;
      const remainingRooms = userRooms.filter(r => r.id !== leftRoomId);
      setUserRooms(remainingRooms);
      
      // Switch to another room if available
      if (remainingRooms.length > 0) {
        setCurrentRoom(remainingRooms[0]);
        localStorage.setItem(LAST_ROOM_KEY, remainingRooms[0].id);
      } else {
        setCurrentRoom(null);
        localStorage.removeItem(LAST_ROOM_KEY);
      }
      
      return { error: null };
    } catch (err) {
      console.error("Unexpected error leaving room:", err);
      return { error: new Error("An unexpected error occurred") };
    }
  };

  const switchRoom = (room: Room) => {
    setCurrentRoom(room);
    localStorage.setItem(LAST_ROOM_KEY, room.id);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const refreshRooms = async () => {
    if (user) {
      await fetchUserRooms(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        currentRoom,
        userRooms,
        loading,
        signUp,
        signIn,
        signOut,
        createRoom,
        joinRoom,
        leaveRoom,
        setCurrentRoom,
        switchRoom,
        refreshProfile,
        refreshRooms,
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
