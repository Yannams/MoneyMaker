import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  role: 'admin' | 'businessman' | null;
  signUp: (email: string, password: string, name: string, phone: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<'admin' | 'businessman' | null>(null);

  const waitWithTimeout = async (task: Promise<void>, timeoutMs = 5000) => {
    await Promise.race([
      task,
      new Promise<void>((resolve) => {
        setTimeout(resolve, timeoutMs);
      }),
    ]);
  };

  const loadUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data?.role === 'admin') {
        setRole('admin');
        setIsAdmin(true);
        return;
      }

      setRole('businessman');
      setIsAdmin(false);
    } catch {
      setRole(null);
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {    
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          console.log(isLoading);
          
          setIsLoading(true);
          await waitWithTimeout(loadUserRole(session.user.id));
          setIsLoading(false);
        } else {
          setRole(null);
          setIsAdmin(false);
          setIsLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await waitWithTimeout(loadUserRole(session.user.id));
      } else {
        setRole(null);
        setIsAdmin(false);
      }

      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    console.log("user:", user);
    
  }, [user]);

  const signUp = async (email: string, password: string, name: string, phone: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
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

    if (!error && data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            user_id: data.user.id,
            name,
            role: 'businessman',
          },
          { onConflict: 'user_id' },
        );

      if (profileError) {
        console.error('Error creating profile:', profileError);
      }

      const { error: businessmanError } = await supabase
        .from('businessmen')
        .upsert(
          {
            user_id: data.user.id,
            phone,
          },
          { onConflict: 'user_id' },
        );

      if (businessmanError) {
        console.error('Error creating businessman profile:', businessmanError);
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
