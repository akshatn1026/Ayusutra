import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getRuntimeConfig } from '../config/runtime-config';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private static instance: SupabaseClient;

  get client(): SupabaseClient {
    if (!SupabaseService.instance) {
      const config = getRuntimeConfig();
      if (!config.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error(
          'Supabase runtime configuration is missing. Set FRONTEND_SUPABASE_URL and FRONTEND_SUPABASE_ANON_KEY before building the frontend.'
        );
      }
      SupabaseService.instance = createClient(
        config.supabaseUrl,
        config.supabaseAnonKey,
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
