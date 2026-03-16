import { environment } from '../../../environments/environment';

export interface RuntimeConfig {
  apiUrl: string;
  frontendUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

declare global {
  interface Window {
    __AYUSUTRA_CONFIG__?: Partial<RuntimeConfig>;
  }
}

const defaults: RuntimeConfig = {
  apiUrl: environment.apiUrl,
  frontendUrl: environment.frontendUrl,
  supabaseUrl: environment.supabaseUrl,
  supabaseAnonKey: environment.supabaseAnonKey
};

function trimTrailingSlash(value: string): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

function normalizeConfig(config: Partial<RuntimeConfig>): RuntimeConfig {
  return {
    apiUrl: trimTrailingSlash(String(config.apiUrl || defaults.apiUrl || '')),
    frontendUrl: trimTrailingSlash(String(config.frontendUrl || defaults.frontendUrl || '')),
    supabaseUrl: trimTrailingSlash(String(config.supabaseUrl || defaults.supabaseUrl || '')),
    supabaseAnonKey: String(config.supabaseAnonKey || defaults.supabaseAnonKey || '').trim()
  };
}

export function setRuntimeConfig(config: Partial<RuntimeConfig>): void {
  if (typeof window === 'undefined') return;
  window.__AYUSUTRA_CONFIG__ = normalizeConfig(config);
}

export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === 'undefined') return defaults;
  return normalizeConfig(window.__AYUSUTRA_CONFIG__ || {});
}

export function buildApiUrl(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return getRuntimeConfig().apiUrl;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = getRuntimeConfig().apiUrl;
  if (!base) return raw;
  return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
}
