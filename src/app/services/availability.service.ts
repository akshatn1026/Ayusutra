import { Injectable, OnDestroy } from '@angular/core';
import { SupabaseService } from '../core/services/supabase.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { BehaviorSubject, interval, Subscription } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AvailabilityService implements OnDestroy {
  private syncSubscription: Subscription | null = null;
  private onlineStatus$ = new BehaviorSubject<boolean>(false);
  private onlineMinutes$ = new BehaviorSubject<number>(0);
  private lastStatusChange: string | null = null;
  private readonly LIMIT = 120; // 2 hours

  public onlineStatus = this.onlineStatus$.asObservable();
  public onlineMinutes = this.onlineMinutes$.asObservable();

  constructor(
    private supabase: SupabaseService,
    private auth: AuthService,
    private toast: ToastService
  ) {
    this.init();
  }

  private async init() {
    const user = this.auth.getCurrentUser();
    if (!user || user.role !== 'doctor') return;

    // Load initial state
    const { data: doctor } = await this.supabase.client
      .from('doctors')
      .select('is_available_now, online_minutes_today, last_status_change')
      .eq('id', user.id)
      .single();

    if (doctor) {
      let currentMinutes = Number(doctor.online_minutes_today || 0);
      this.lastStatusChange = doctor.last_status_change;

      // Daily reset check
      const todayStr = new Date().toDateString();
      const lastChangeDate = this.lastStatusChange ? new Date(this.lastStatusChange).toDateString() : null;
      
      if (lastChangeDate && todayStr !== lastChangeDate) {
        currentMinutes = 0;
        await this.supabase.client.from('doctors').update({ online_minutes_today: 0 }).eq('id', user.id);
      }

      this.onlineStatus$.next(doctor.is_available_now);
      this.onlineMinutes$.next(currentMinutes);

      if (doctor.is_available_now) {
        this.startSync();
      }
    }
  }

  public async toggleStatus(status: boolean) {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    const now = new Date().toISOString();

    if (status) {
      // Going Online
      const { error } = await this.supabase.client
        .from('doctors')
        .update({ is_available_now: true, last_status_change: now })
        .eq('id', user.id);

      if (!error) {
        this.onlineStatus$.next(true);
        this.lastStatusChange = now;
        this.startSync();
        this.toast.show('You are now ready for emergency calls', 'success');
      } else {
        this.toast.show('Failed to go online', 'error');
      }
    } else {
      // Going Offline
      await this.syncWithDb();
      const { error } = await this.supabase.client
        .from('doctors')
        .update({ is_available_now: false, last_status_change: now })
        .eq('id', user.id);

      if (!error) {
        this.onlineStatus$.next(false);
        this.stopSync();
        this.toast.show('You are now offline', 'info');
      }
    }
  }

  private startSync() {
    if (this.syncSubscription) return;
    this.syncSubscription = interval(60000).subscribe(() => this.syncWithDb());
  }

  private stopSync() {
    if (this.syncSubscription) {
      this.syncSubscription.unsubscribe();
      this.syncSubscription = null;
    }
  }

  private async syncWithDb() {
    const user = this.auth.getCurrentUser();
    if (!user || !this.onlineStatus$.value || !this.lastStatusChange) return;

    const lastChange = new Date(this.lastStatusChange).getTime();
    const now = new Date();
    const diffMinutes = (now.getTime() - lastChange) / (1000 * 60);

    if (diffMinutes >= 1) {
      const { data: doctor } = await this.supabase.client
        .from('doctors')
        .select('online_minutes_today')
        .eq('id', user.id)
        .single();
      
      const newTotal = Number(doctor?.online_minutes_today || 0) + diffMinutes;
      
      await this.supabase.client
        .from('doctors')
        .update({ online_minutes_today: newTotal, last_status_change: now.toISOString() })
        .eq('id', user.id);

      this.onlineMinutes$.next(newTotal);
      this.lastStatusChange = now.toISOString();

      if (newTotal >= this.LIMIT) {
        await this.toggleStatus(false);
        this.toast.show('Daily 2-hour limit reached. You are now offline.', 'warning');
      }
    }
  }

  ngOnDestroy() {
    this.stopSync();
  }
}
