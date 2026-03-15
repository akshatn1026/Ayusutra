import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

export interface HealthTimelineEvent {
  id: string;
  userId: string;
  eventType: string;
  title: string;
  details: string;
  metadata: Record<string, any>;
  occurredAt: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class HealthTimelineService {
  private readonly API = '/api/timeline';

  constructor(private http: HttpClient) {}
  // headers() removed; handled by interceptor

  async getTimeline(limit = 80): Promise<HealthTimelineEvent[]> {
    const safeLimit = Math.max(10, Math.min(200, Number(limit || 80)));
    const response = await firstValueFrom(
      this.http.get<{ events: HealthTimelineEvent[] }>(`${this.API}?limit=${safeLimit}`)
    );
    return response.events || [];
  }

  async addEvent(input: {
    eventType: string;
    title: string;
    details?: string;
    metadata?: Record<string, any>;
    occurredAt?: string;
  }): Promise<HealthTimelineEvent> {
    const response = await firstValueFrom(
      this.http.post<{ event: HealthTimelineEvent }>(
        `${this.API}/event`,
        {
          eventType: input.eventType,
          title: input.title,
          details: input.details || '',
          metadata: input.metadata || {},
          occurredAt: input.occurredAt || ''
        },
      )
    );
    return response.event;
  }
}
