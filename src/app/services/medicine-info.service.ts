import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface MedicineInfoRecord {
  id: string;
  name: string;
  type: 'herb' | 'formulation' | 'medicine';
  botanicalName: string;
  classicalNames: string[];
  description: string;
  ayurvedicProperties: {
    rasa: string;
    guna: string;
    virya: string;
    vipaka: string;
    doshaEffect: string;
  };
  therapeuticUses: string[];
  usageGuidelines: string;
  dosageForms: string;
  precautions: string;
  contraindications: string;
  sideEffects: string;
  pregnancySafety: string;
  scientificEvidence: Array<{
    source: string;
    summary: string;
    link: string;
  }>;
  references: string[];
  prescriptionOnly: boolean;
  disclaimer: string;
}

@Injectable({
  providedIn: 'root'
})
export class MedicineInfoService {
  private readonly baseUrl = '/api/medicine';

  constructor(private http: HttpClient) {}

  async search(query: string): Promise<{ data: MedicineInfoRecord[]; error?: string }> {
    const params = new HttpParams().set('q', query.trim());
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: MedicineInfoRecord[] }>(`${this.baseUrl}/search`, { params })
      );
      return { data: res.data || [] };
    } catch (err) {
      return { data: [], error: this.readError(err) };
    }
  }

  async getDetail(id: string): Promise<{ data?: MedicineInfoRecord; error?: string }> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: MedicineInfoRecord }>(`${this.baseUrl}/detail/${encodeURIComponent(id)}`)
      );
      return { data: res.data };
    } catch (err) {
      return { error: this.readError(err) };
    }
  }

  private readError(err: unknown): string {
    const httpErr = err as HttpErrorResponse;
    if (httpErr?.status === 0) {
      return 'Unable to reach realtime backend. Start `npm run consult:server` and retry.';
    }
    if (httpErr?.error?.error) return String(httpErr.error.error);
    if (httpErr?.message) return httpErr.message;
    return 'Unable to fetch verified medicine data.';
  }
}
