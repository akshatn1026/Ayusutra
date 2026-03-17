import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, DoshaAssessmentDraft, DoshaAssessmentRecord } from './auth.service';

interface DoshaOptionConfig {
  key: string;
  label: string;
  map: Partial<Record<'Vata' | 'Pitta' | 'Kapha', number>>;
}

interface DoshaQuestionConfig {
  key: string;
  prompt: string;
  track: 'prakriti' | 'vikriti';
  weight: number;
  options: DoshaOptionConfig[];
}

export interface DoshaSectionConfig {
  id: string;
  title: string;
  purpose: string;
  questions: DoshaQuestionConfig[];
}

export interface DoshaSymptomConfig {
  key: string;
  label: string;
  map: Partial<Record<'Vata' | 'Pitta' | 'Kapha', number>>;
}

export interface DoshaCooldownStatus {
  canReassess: boolean;
  cooldownDays: number;
  daysSinceLast: number | null;
  latest?: DoshaAssessmentRecord | null;
  message: string;
}

export interface DoshaConfigResponse {
  sections: DoshaSectionConfig[];
  symptoms: DoshaSymptomConfig[];
  cooldown: DoshaCooldownStatus;
  latestAssessment: DoshaAssessmentRecord | null;
}

@Injectable({ providedIn: 'root' })
export class DoshaAssessmentService {
  private readonly API = '/api/dosha';

  constructor(private http: HttpClient) {}

  async getConfig(): Promise<DoshaConfigResponse> {
    return firstValueFrom(this.http.get<DoshaConfigResponse>(`${this.API}/config`));
  }

  async getDraft(): Promise<DoshaAssessmentDraft | null> {
    const response = await firstValueFrom(this.http.get<{ draft: DoshaAssessmentDraft | null }>(`${this.API}/draft`));
    return response.draft || null;
  }

  async saveDraft(draft: DoshaAssessmentDraft): Promise<DoshaAssessmentDraft> {
    const response = await firstValueFrom(
      this.http.put<{ draft: DoshaAssessmentDraft }>(`${this.API}/draft`, { draft })
    );
    return response.draft;
  }

  async getAssessments(limit = 12): Promise<{ history: DoshaAssessmentRecord[]; latest: DoshaAssessmentRecord | null; cooldown: DoshaCooldownStatus }> {
    return firstValueFrom(
      this.http.get<{ history: DoshaAssessmentRecord[]; latest: DoshaAssessmentRecord | null; cooldown: DoshaCooldownStatus }>(
        `${this.API}/assessments?limit=${Math.min(48, Math.max(1, limit))}`
      )
    );
  }

  async submitAssessment(input: {
    answers: Record<string, string>;
    symptoms: Array<{ key: string; label: string; severity: 'Low' | 'Medium' | 'High' }>;
    doctorApproved?: boolean;
    force?: boolean;
  }): Promise<{ record: DoshaAssessmentRecord; summary: string; supportiveNotice: string; safety: string | null }> {
    return firstValueFrom(
      this.http.post<{ record: DoshaAssessmentRecord; summary: string; supportiveNotice: string; safety: string | null }>(
        `${this.API}/assessment`,
        input,
      )
    );
  }
}

