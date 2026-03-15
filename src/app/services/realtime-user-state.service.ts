import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription, firstValueFrom } from 'rxjs';
import { AuthService, User } from './auth.service';
import { AyurvedaDataService } from './ayurveda-data.service';
import { SupabaseService } from '../core/services/supabase.service';

type UserStateMap = Record<string, string>;

@Injectable({
  providedIn: 'root'
})
export class RealtimeUserStateService implements OnDestroy {
  private readonly OWNER_KEY = 'ayustra_state_owner_id';
  private readonly TRACKED_PREFIXES = ['ayustra_', 'ayusutra_'];
  private readonly EXCLUDED_KEYS = new Set<string>([
    'ayustra_user',
    this.OWNER_KEY
  ]);
  private readonly API_STATE = '/api/user/state';

  private authSub?: Subscription;
  private activeUserId = '';
  private channel: any = null;
  private uploadTimer: any = null;
  private pollTimer: any = null;
  private applyingSnapshot = false;
  private lastServerUpdatedAt = '';

  private readonly originalSetItem = localStorage.setItem.bind(localStorage);
  private readonly originalRemoveItem = localStorage.removeItem.bind(localStorage);
  private readonly originalClear = localStorage.clear.bind(localStorage);
  private readonly originalGetItem = localStorage.getItem.bind(localStorage);

  constructor(
    private auth: AuthService,
    private ayurvedaData: AyurvedaDataService,
    private http: HttpClient,
    private supabaseService: SupabaseService
  ) {
    this.patchLocalStorage();
    this.authSub = this.auth.currentUser$.subscribe((user) => {
      void this.handleUserChange(user);
    });
  }

  ngOnDestroy(): void {
    if (this.authSub) this.authSub.unsubscribe();
    if (this.uploadTimer) clearTimeout(this.uploadTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.disconnectChannel();
  }

  private async handleUserChange(user: User | null): Promise<void> {
    const nextUserId = user?.id || '';
    if (nextUserId === this.activeUserId) return;

    this.activeUserId = nextUserId;
    this.lastServerUpdatedAt = '';
    this.disconnectChannel();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (!user) {
      this.clearTrackedKeys();
      return;
    }

    const currentOwner = this.originalGetItem(this.OWNER_KEY) || '';
    const localSnapshot = currentOwner === user.id ? this.captureTrackedState() : {};

    this.clearTrackedKeys();
    this.originalSetItem(this.OWNER_KEY, user.id);

    const remote = await this.fetchRemoteState();
    if (Object.keys(remote.state).length > 0) {
      this.applySnapshot(remote.state);
      this.lastServerUpdatedAt = remote.updatedAt || '';
    } else if (Object.keys(localSnapshot).length > 0) {
      this.applySnapshot(localSnapshot);
      await this.pushSnapshotNow();
    }

    this.auth.reloadPatientsFromStorage();
    this.ayurvedaData.reloadFromStorage();
    this.connectChannel();
    this.pollTimer = setInterval(() => {
      void this.pullRemoteIfChanged();
    }, 15000);
  }

  private patchLocalStorage(): void {
    const marker = '__ayustra_storage_sync_patched__';
    const win = window as any;
    if (win[marker]) return;
    win[marker] = true;

    (localStorage as any).setItem = (key: string, value: string): void => {
      this.originalSetItem(key, value);
      if (this.shouldSyncKey(key)) this.scheduleUpload();
    };
    (localStorage as any).removeItem = (key: string): void => {
      this.originalRemoveItem(key);
      if (this.shouldSyncKey(key)) this.scheduleUpload();
    };
    (localStorage as any).clear = (): void => {
      const hadTracked = Object.keys(localStorage).some((key) => this.isTrackedKey(key));
      this.originalClear();
      if (hadTracked && this.activeUserId && !this.applyingSnapshot) this.scheduleUpload();
    };
  }

  private shouldSyncKey(key: string): boolean {
    if (this.applyingSnapshot) return false;
    if (!this.activeUserId) return false;
    if (!this.isTrackedKey(key)) return false;
    const owner = this.originalGetItem(this.OWNER_KEY) || '';
    return owner === this.activeUserId;
  }

  private isTrackedKey(key: string): boolean {
    if (!key || this.EXCLUDED_KEYS.has(key)) return false;
    return this.TRACKED_PREFIXES.some((prefix) => key.startsWith(prefix));
  }

  private clearTrackedKeys(): void {
    const keys = Object.keys(localStorage).filter((key) => this.isTrackedKey(key));
    keys.forEach((key) => this.originalRemoveItem(key));
  }

  private captureTrackedState(): UserStateMap {
    const state: UserStateMap = {};
    Object.keys(localStorage)
      .filter((key) => this.isTrackedKey(key))
      .forEach((key) => {
        const value = this.originalGetItem(key);
        if (typeof value === 'string') state[key] = value;
      });
    return state;
  }

  private applySnapshot(state: UserStateMap): void {
    this.applyingSnapshot = true;
    try {
      this.clearTrackedKeys();
      Object.entries(state || {}).forEach(([key, value]) => {
        if (!this.isTrackedKey(key)) return;
        if (typeof value !== 'string') return;
        this.originalSetItem(key, value);
      });
      if (this.activeUserId) this.originalSetItem(this.OWNER_KEY, this.activeUserId);
    } finally {
      this.applyingSnapshot = false;
    }
  }

  private scheduleUpload(): void {
    if (!this.activeUserId) return;
    if (this.uploadTimer) clearTimeout(this.uploadTimer);
    this.uploadTimer = setTimeout(() => {
      void this.pushSnapshotNow();
    }, 400);
  }

  // authHeaders removed; handled by interceptor

  private async fetchRemoteState(): Promise<{ state: UserStateMap; updatedAt: string | null }> {
    if (!this.activeUserId) return { state: {}, updatedAt: null };
    try {
      const response = await firstValueFrom(
        this.http.get<{ userId: string; state: UserStateMap; updatedAt: string | null }>(this.API_STATE)
      );
      if (response.userId !== this.activeUserId) return { state: {}, updatedAt: null };
      return {
        state: response.state || {},
        updatedAt: response.updatedAt || null
      };
    } catch {
      return { state: {}, updatedAt: null };
    }
  }

  private async pullRemoteIfChanged(): Promise<void> {
    if (!this.activeUserId) return;
    const remote = await this.fetchRemoteState();
    if (!remote.updatedAt) return;
    if (this.lastServerUpdatedAt && remote.updatedAt <= this.lastServerUpdatedAt) return;
    this.applySnapshot(remote.state || {});
    this.lastServerUpdatedAt = remote.updatedAt;
    this.auth.reloadPatientsFromStorage();
    this.ayurvedaData.reloadFromStorage();
  }

  private async pushSnapshotNow(): Promise<void> {
    if (!this.activeUserId) return;

    try {
      const payload = { state: this.captureTrackedState() };
      const response = await firstValueFrom(
        this.http.put<{ userId: string; updatedAt: string }>(this.API_STATE, payload)
      );
      if (response.userId === this.activeUserId && response.updatedAt) {
        this.lastServerUpdatedAt = response.updatedAt;
      }
    } catch {
      // keep local data and retry on next write/poll cycle
    }
  }

  private connectChannel(): void {
    if (!this.activeUserId) return;

    this.channel = this.supabaseService.client
      .channel('user_state_changes')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'user_states',
        filter: `user_id=eq.${this.activeUserId}`
      }, (payload: any) => {
        const event = payload.new;
        if (event.updated_at && this.lastServerUpdatedAt && event.updated_at <= this.lastServerUpdatedAt) return;
        void this.pullRemoteIfChanged();
      })
      .subscribe();
  }

  private disconnectChannel(): void {
    if (this.channel) {
      this.supabaseService.client.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
