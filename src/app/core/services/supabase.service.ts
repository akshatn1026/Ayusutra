import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private static instance: SupabaseClient;

  get client(): SupabaseClient {
    if (!SupabaseService.instance) {
      SupabaseService.instance = createClient(
        environment.supabaseUrl,
        environment.supabaseAnonKey,
        {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            lock: (() => Promise.resolve()) as any
          }
        }
      );
    }
    return SupabaseService.instance;
  }
}
