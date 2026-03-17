import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent } from '@angular/common/http';
import { Observable, firstValueFrom, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { SupabaseService } from '../core/services/supabase.service';

export type MedicalReportStatus = 'Normal' | 'Slightly Low' | 'Slightly High' | 'Critical';

export interface MedicalReportParameter {
  id: string;
  testName: string;
  value: number;
  unit: string;
  normalRange: string;
  status: MedicalReportStatus;
  explanation: string;
  possibleCauses: string[];
  suggestions: string[];
  sourceLine: string;
}

export interface MedicalReportSummary {
  highlights: string[];
  overallRecommendation: string;
}

export interface MedicalReportCounts {
  total: number;
  normal: number;
  slightlyLow: number;
  slightlyHigh: number;
  critical: number;
}

export interface MedicalResourceLink {
  label: string;
  url: string;
}

export interface MedicalReportAnalysisResult {
  generatedAt: string;
  disclaimer: string;
  parameters: MedicalReportParameter[];
  summary: MedicalReportSummary;
  counts: MedicalReportCounts;
  healthScore: number;
  trustedResources: MedicalResourceLink[];
}

export interface MedicalReportRecord {
  id: string;
  userId: string;
  fileName: string;
  uploadedAt: string;
  extractedText?: string;
  extractedTextPreview?: string;
  analysisResult: MedicalReportAnalysisResult;
}

export interface MedicalReportAnalyzeResponse {
  report: MedicalReportRecord;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class MedicalReportService {
  private readonly API = '/api/medical-reports';

  constructor(
    private http: HttpClient,
    private supabase: SupabaseService
  ) { }

  uploadReport(file: File): Observable<HttpEvent<MedicalReportAnalyzeResponse>> {
    const bucket = 'medical-reports';
    const filePath = `user_reports/${Date.now()}_${file.name}`;

    return from(this.supabase.client.storage.from(bucket).upload(filePath, file)).pipe(
      switchMap((result: { data: any; error: any } | null | undefined) => {
        if (!result) {
          throw new Error('Storage returned no response. Check if the bucket exists.');
        }
        const { data, error } = result;
        if (error) {
          throw new Error(error.message || 'Storage upload failed.');
        }
        if (!data?.path) {
          throw new Error('File uploaded but no path was returned.');
        }
        return this.http.post<MedicalReportAnalyzeResponse>(`${this.API}/analyze`, {
          filePath: data.path,
          fileName: file.name
        }, {
          observe: 'events',
          reportProgress: true
        });
      })
    );
  }  

  async listReports(): Promise<MedicalReportRecord[]> {
    const response = await firstValueFrom(
      this.http.get<{ reports: MedicalReportRecord[] }>(this.API)
    );
    return response.reports || [];
  }

  async getReport(reportId: string): Promise<MedicalReportRecord> {
    const response = await firstValueFrom(
      this.http.get<{ report: MedicalReportRecord }>(`${this.API}/${encodeURIComponent(reportId)}`)
    );
    return response.report;
  }

  async deleteReport(reportId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.API}/${encodeURIComponent(reportId)}`)
    );
  }
}