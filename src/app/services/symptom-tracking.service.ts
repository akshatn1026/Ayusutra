import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

export type SymptomSeverity = 'Low' | 'Medium' | 'High';

export interface DailySymptomLog {
  id: string;
  symptom: string;
  severity: SymptomSeverity;
  note: string;
  loggedForDate: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class SymptomTrackingService {
  private readonly API = '/api/symptoms/daily';

  constructor(private http: HttpClient) {}

  async getRecent(days = 14): Promise<{ today: DailySymptomLog[]; recent: DailySymptomLog[] }> {
    const safeDays = Math.max(1, Math.min(30, Number(days || 14)));
    return firstValueFrom(
      this.http.get<{ today: DailySymptomLog[]; recent: DailySymptomLog[] }>(`${this.API}?days=${safeDays}`)
    );
  }

  async logSymptom(input: {
    symptom: string;
    severity?: SymptomSeverity;
    note?: string;
    loggedForDate?: string;
  }): Promise<DailySymptomLog> {
    const response = await firstValueFrom(
      this.http.post<{ entry: DailySymptomLog }>(
        this.API,
        {
          symptom: input.symptom,
          severity: input.severity || 'Medium',
          note: input.note || '',
          loggedForDate: input.loggedForDate || ''
        }
      )
    );
    return response.entry;
  }
}
