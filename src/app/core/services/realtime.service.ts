import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { BehaviorSubject, Observable, filter } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class RealtimeService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private onlineDoctorsSubject = new BehaviorSubject<string[]>([]);
  public onlineDoctors$ = this.onlineDoctorsSubject.asObservable();

  constructor(private supabase: SupabaseService) {
    this.initPresence();
  }

  private initPresence() {
    const channel = this.supabase.client.channel('online_presence', {
      config: { presence: { key: 'online' } }
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const ids = Object.values(state)
          .flat()
          .map((p: any) => p.userId)
          .filter(Boolean);
        this.onlineDoctorsSubject.next(ids);
      })
      .subscribe();
    
    this.channels.set('presence', channel);
  }

  /**
   * Join a consultation room for chat and WebRTC signaling
   */
  joinConsultation(sessionId: string, onMessage: (payload: any) => void) {
    const channelName = `consultation:${sessionId}`;
    if (this.channels.has(channelName)) return;

    const channel = this.supabase.client.channel(channelName);

    channel
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => onMessage(payload))
      .on('broadcast', { event: 'webrtc-signal' }, ({ payload }) => {
        // Handle signaling logic here or expose via another observable
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to consultation ${sessionId}`);
        }
      });

    this.channels.set(channelName, channel);
  }

  leaveConsultation(sessionId: string) {
    const channelName = `consultation:${sessionId}`;
    const channel = this.channels.get(channelName);
    if (channel) {
      channel.unsubscribe();
      this.channels.delete(channelName);
    }
  }

  sendMessage(sessionId: string, message: any) {
    const channel = this.channels.get(`consultation:${sessionId}`);
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'chat-message',
        payload: message
      });
    }
  }

  sendSignal(sessionId: string, signal: any) {
    const channel = this.channels.get(`consultation:${sessionId}`);
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'webrtc-signal',
        payload: signal
      });
    }
  }

  /**
   * Listen for user-specific state updates
   */
  subscribeToUserState(userId: string, onUpdate: (state: any) => void) {
    const channelName = `user_state:${userId}`;
    const channel = this.supabase.client.channel(channelName);

    channel
      .on('broadcast', { event: 'state-updated' }, ({ payload }) => onUpdate(payload))
      .subscribe();

    this.channels.set(channelName, channel);
  }
}
