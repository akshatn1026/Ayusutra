import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

export type GuidanceType = 'daily' | 'condition' | 'dosha_balancing' | 'post_consultation' | 'preventive' | 'safety';
export type GuidanceFeedbackType = 'helpful' | 'ignored' | 'saved' | 'dismissed';

export interface GuidanceItem {
  id: string;
  userId: string;
  type: GuidanceType;
  content: string;
  triggerReason: string;
  whySuggested: string;
  whenToFollow: string;
  priority: number;
  createdAt: string;
  expiresAt: string;
  isSaved: boolean;
  isDismissed: boolean;
}

export interface GuidanceResponse {
  generatedAt: string;
  contextVersion: string;
  fromCache: boolean;
  advisory: string;
  items: GuidanceItem[];
}

@Injectable({ providedIn: 'root' })
export class PersonalizedGuidanceService {
  private readonly API = '/api/guidance';

  constructor(private http: HttpClient) {}

  async getGuidance(force = false): Promise<GuidanceResponse> {
    const query = force ? '?force=1' : '';
    return firstValueFrom(this.http.get<GuidanceResponse>(`${this.API}${query}`));
  }

  async refreshGuidance(): Promise<GuidanceResponse> {
    return firstValueFrom(this.http.post<GuidanceResponse>(`${this.API}/refresh`, {}));
  }

  async submitFeedback(guidanceId: string, feedbackType: GuidanceFeedbackType): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${this.API}/feedback`,
        { guidanceId, feedbackType }
      )
    );
  }
}

