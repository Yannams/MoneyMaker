import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { AuthError, User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  role: 'admin' | 'businessman' | null;
  signUp: (email: string, password: string, name: string, phone: string) => Promise<{ error: AuthError | Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<'admin' | 'businessman' | null>(null);

  const getMetadataString = (value: unknown) => {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  };

  const ensureUserRecords = async (currentUser: User) => {
    const profileName = getMetadataString(currentUser.user_metadata?.name);
    const profilePhone = getMetadataString(currentUser.user_metadata?.phone) ?? '+229 0100000000';

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('profiles')
      .select('user_id, name, role')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (existingProfileError) {
      throw existingProfileError;
    }

    const profilePayload = existingProfile
      ? { name: existingProfile.name ?? profileName }
      : {
          user_id: currentUser.id,
          name: profileName,
          role: 'businessman' as const,
        };

    const profileQuery = existingProfile
      ? supabase.from('profiles').update(profilePayload).eq('user_id', currentUser.id)
      : supabase.from('profiles').insert(profilePayload);

    const { error: profileError } = await profileQuery;

    if (profileError) {
      throw profileError;
    }

    const { data: existingBusinessman, error: existingBusinessmanError } = await supabase
      .from('businessmen')
      .select('id, phone')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (existingBusinessmanError) {
      throw existingBusinessmanError;
    }

    const businessmanPayload = existingBusinessman
      ? { phone: existingBusinessman.phone ?? profilePhone }
      : {
          user_id: currentUser.id,
          phone: profilePhone,
        };

    const businessmanQuery = existingBusinessman
      ? supabase.from('businessmen').update(businessmanPayload).eq('user_id', currentUser.id)
      : supabase.from('businessmen').insert(businessmanPayload);

    const { error: businessmanError } = await businessmanQuery;

    if (businessmanError) {
      throw businessmanError;
    }
  };

  const loadUserRole = async (userId: string): Promise<'admin' | 'businessman' | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data?.role === 'admin') {
        return 'admin';
      }

      if (!error && data?.role === 'businessman') {
        return 'businessman';
      }

      return null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const syncAuthState = async (nextSession: Session | null) => {
      if (!isMounted) return;

      setIsLoading(true);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setRole(null);
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      try {
        await ensureUserRecords(nextSession.user);
      } catch {
        setRole(null);
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      const nextRole = await loadUserRole(nextSession.user.id);
      if (!isMounted) return;

      if (nextRole === 'admin') {
        setRole('admin');
        setIsAdmin(true);
      } else if (nextRole === 'businessman') {
        setRole('businessman');
        setIsAdmin(false);
      } else {
        setRole(null);
        setIsAdmin(false);
      }

      setIsLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncAuthState(nextSession);
    });

    void supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      void syncAuthState(currentSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, name: string, phone: string) => {
    const redirectUrl = `${window.location.origin}/auth`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          name,
          phone,
        }
      }
    });

    if (!error && data.session?.user) {
      try {
        await ensureUserRecords(data.session.user);
      } catch (recordError) {
        return {
          error: recordError instanceof Error ? recordError : new Error("Impossible d'initialiser le profil utilisateur"),
        };
      }
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, isAdmin, role, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
