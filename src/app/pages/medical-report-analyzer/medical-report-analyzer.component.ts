import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Subscription } from 'rxjs';
import {
  MedicalReportAnalysisResult,
  MedicalReportParameter,
  MedicalReportRecord,
  MedicalReportService,
  MedicalReportStatus
} from '../../services/medical-report.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-medical-report-analyzer',
  templateUrl: './medical-report-analyzer.component.html',
  styleUrls: ['./medical-report-analyzer.component.scss']
})
export class MedicalReportAnalyzerComponent implements OnInit, OnDestroy {
  readonly maxFileSizeBytes = 10 * 1024 * 1024;
  readonly acceptedFileExtensions = '.pdf,.jpg,.jpeg,.png';
  readonly statusBars = [
    { key: 'normal' as const, label: 'Normal', cssClass: 'status-normal' },
    { key: 'slightlyLow' as const, label: 'Slightly Low', cssClass: 'status-low' },
    { key: 'slightlyHigh' as const, label: 'Slightly High', cssClass: 'status-high' },
    { key: 'critical' as const, label: 'Critical', cssClass: 'status-critical' }
  ];

  selectedFile: File | null = null;
  dragActive = false;
  isAnalyzing = false;
  isLoadingHistory = false;
  isLoadingReport = false;
  uploadProgress = 0;
  errorMessage = '';
  successMessage = '';
  reports: MedicalReportRecord[] = [];
  activeReport: MedicalReportRecord | null = null;
  deletingReportId = '';

  followUpQuestion = '';
  followUpAnswer = '';

  private uploadSubscription?: Subscription;

  constructor(
    private medicalReportService: MedicalReportService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadReportHistory();
  }

  ngOnDestroy(): void {
    if (this.uploadSubscription) {
      this.uploadSubscription.unsubscribe();
    }
  }

  get canAnalyze(): boolean {
    return !!this.selectedFile && !this.isAnalyzing;
  }

  get activeAnalysis(): MedicalReportAnalysisResult | null {
    return this.activeReport?.analysisResult || null;
  }

  get healthScore(): number {
    const score = Number(this.activeAnalysis?.healthScore || 0);
    if (!Number.isFinite(score)) return 0;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  get healthScoreLabel(): string {
    if (this.healthScore >= 80) return 'Good';
    if (this.healthScore >= 60) return 'Needs Attention';
    return 'Critical Attention';
  }

  get healthScoreStyle(): Record<string, string> {
    const score = this.healthScore;
    const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
    return {
      background: `conic-gradient(${color} ${score}%, rgba(148, 163, 184, 0.25) ${score}% 100%)`
    };
  }

  get userCanUpload(): boolean {
    const user = this.authService.getCurrentUser();
    return !!user && user.role === 'patient';
  }

  onFileInputChanged(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files && input.files.length > 0 ? input.files[0] : null;
    this.setSelectedFile(file);
    if (input) input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragActive = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive = false;
    const file = event.dataTransfer?.files && event.dataTransfer.files.length > 0
      ? event.dataTransfer.files[0]
      : null;
    this.setSelectedFile(file);
  }

  clearSelectedFile(): void {
    this.selectedFile = null;
    this.uploadProgress = 0;
  }

  analyzeSelectedFile(): void {
    if (!this.userCanUpload) {
      this.errorMessage = 'Only patient accounts can upload medical reports.';
      return;
    }
    if (!this.selectedFile || this.isAnalyzing) return;
    const validationError = this.validateSelectedFile(this.selectedFile);
    if (validationError) {
      this.errorMessage = validationError;
      return;
    }

    if (this.uploadSubscription) {
      this.uploadSubscription.unsubscribe();
    }
    this.errorMessage = '';
    this.successMessage = '';
    this.uploadProgress = 0;
    this.isAnalyzing = true;
    const fileToUpload = this.selectedFile;

    this.uploadSubscription = this.medicalReportService.uploadReport(fileToUpload).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          const total = Number(event.total || fileToUpload.size || 0);
          if (total > 0) {
            this.uploadProgress = Math.max(1, Math.min(100, Math.round((Number(event.loaded || 0) / total) * 100)));
          }
          return;
        }
        if (event.type === HttpEventType.Response) {
          const response = event.body;
          if (!response?.report) {
            this.errorMessage = 'Report upload completed but no analysis result was returned.';
            return;
          }
          this.activeReport = response.report;
          this.reports = [response.report, ...this.reports.filter((entry) => entry.id !== response.report.id)];
          this.successMessage = response.message || 'Medical report analyzed successfully.';
          this.selectedFile = null;
          this.followUpQuestion = '';
          this.followUpAnswer = '';
          this.uploadProgress = 100;
        }
      },
      error: (err: HttpErrorResponse) => {
        this.errorMessage = this.extractError(err);
        this.isAnalyzing = false;
      },
      complete: () => {
        this.isAnalyzing = false;
      }
    });
  }

  async loadReportHistory(): Promise<void> {
    this.isLoadingHistory = true;
    this.errorMessage = '';
    try {
      const reports = await this.medicalReportService.listReports();
      this.reports = reports;
      if (reports.length > 0) {
        await this.openReport(reports[0].id);
      } else {
        this.activeReport = null;
      }
    } catch (err) {
      this.errorMessage = this.extractError(err);
    } finally {
      this.isLoadingHistory = false;
    }
  }

  async openReport(reportId: string): Promise<void> {
    if (!reportId) return;
    this.isLoadingReport = true;
    this.errorMessage = '';
    try {
      const report = await this.medicalReportService.getReport(reportId);
      this.activeReport = report;
      const existing = this.reports.findIndex((entry) => entry.id === report.id);
      if (existing >= 0) {
        this.reports[existing] = report;
      } else {
        this.reports.unshift(report);
      }
    } catch (err) {
      this.errorMessage = this.extractError(err);
    } finally {
      this.isLoadingReport = false;
    }
  }

  async deleteReport(report: MedicalReportRecord, event?: Event): Promise<void> {
    if (event) event.stopPropagation();
    if (!report?.id) return;
    const ok = window.confirm('Delete this uploaded report permanently?');
    if (!ok) return;

    this.deletingReportId = report.id;
    this.errorMessage = '';
    this.successMessage = '';
    try {
      await this.medicalReportService.deleteReport(report.id);
      this.reports = this.reports.filter((entry) => entry.id !== report.id);
      if (this.activeReport?.id === report.id) {
        this.activeReport = null;
        if (this.reports.length > 0) {
          await this.openReport(this.reports[0].id);
        }
      }
      this.successMessage = 'Report deleted successfully.';
    } catch (err) {
      this.errorMessage = this.extractError(err);
    } finally {
      this.deletingReportId = '';
    }
  }

  trackByReportId(_index: number, report: MedicalReportRecord): string {
    return report.id;
  }

  trackByParameterId(_index: number, parameter: MedicalReportParameter): string {
    return `${parameter.id}_${parameter.value}_${parameter.status}`;
  }

  parameterStatusClass(status: MedicalReportStatus): string {
    if (status === 'Normal') return 'status-normal';
    if (status === 'Slightly Low') return 'status-low';
    if (status === 'Slightly High') return 'status-high';
    return 'status-critical';
  }

  statusCount(key: 'normal' | 'slightlyLow' | 'slightlyHigh' | 'critical'): number {
    return Number(this.activeAnalysis?.counts?.[key] || 0);
  }

  statusBarWidth(key: 'normal' | 'slightlyLow' | 'slightlyHigh' | 'critical'): number {
    const total = Number(this.activeAnalysis?.counts?.total || 0);
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((this.statusCount(key) / total) * 100)));
  }

  parameterMarkerOffset(parameter: MedicalReportParameter): number {
    const range = this.parseRange(parameter.normalRange);
    if (!range) return 50;
    const span = Math.max(range.high - range.low, 1);
    const min = range.low - span * 0.5;
    const max = range.high + span * 0.5;
    const bounded = Math.min(max, Math.max(min, Number(parameter.value || 0)));
    return Math.round(((bounded - min) / (max - min)) * 100);
  }

  askFollowUp(): void {
    const report = this.activeReport;
    const question = this.followUpQuestion.trim();
    if (!report || !question) {
      this.followUpAnswer = 'Enter a specific question to get a contextual explanation.';
      return;
    }

    const normalizedQuestion = question.toLowerCase();
    const matches = report.analysisResult.parameters.filter((parameter) => {
      const name = parameter.testName.toLowerCase();
      const id = parameter.id.replace(/_/g, ' ').toLowerCase();
      return normalizedQuestion.includes(name) || normalizedQuestion.includes(id);
    });

    if (matches.length > 0) {
      const parameter = matches[0];
      const causes = parameter.possibleCauses.slice(0, 2).join(', ');
      const suggestions = parameter.suggestions.slice(0, 2).join(' ');
      this.followUpAnswer =
        `${parameter.testName} is marked as ${parameter.status}. ${parameter.explanation}` +
        `${causes ? ` Possible causes include ${causes}.` : ''}` +
        `${suggestions ? ` Suggested next steps: ${suggestions}` : ''}`;
      return;
    }

    if (normalizedQuestion.includes('summary') || normalizedQuestion.includes('overall')) {
      this.followUpAnswer = report.analysisResult.summary.overallRecommendation;
      return;
    }

    if (normalizedQuestion.includes('critical')) {
      const critical = report.analysisResult.parameters.filter((parameter) => parameter.status === 'Critical');
      this.followUpAnswer =
        critical.length > 0
          ? `Critical parameters found: ${critical.map((entry) => entry.testName).join(', ')}. Please consult a doctor promptly.`
          : 'No critical parameters were detected in this report.';
      return;
    }

    this.followUpAnswer =
      'Try asking about a specific parameter (for example, hemoglobin, vitamin D, cholesterol) or ask for an overall summary.';
  }

  formatReportDate(value: string): string {
    if (!value) return 'Unknown date';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  }

  formatBytes(value: number): string {
    const bytes = Number(value || 0);
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let current = bytes;
    let unitIndex = 0;
    while (current >= 1024 && unitIndex < units.length - 1) {
      current /= 1024;
      unitIndex += 1;
    }
    return `${current.toFixed(current >= 10 ? 0 : 1)} ${units[unitIndex]}`;
  }

  private setSelectedFile(file: File | null): void {
    this.errorMessage = '';
    this.successMessage = '';
    this.followUpAnswer = '';
    this.followUpQuestion = '';
    this.uploadProgress = 0;
    if (!file) {
      this.selectedFile = null;
      return;
    }
    const validationError = this.validateSelectedFile(file);
    if (validationError) {
      this.selectedFile = null;
      this.errorMessage = validationError;
      return;
    }
    this.selectedFile = file;
  }

  private validateSelectedFile(file: File): string | null {
    const mimeType = String(file.type || '').toLowerCase();
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(mimeType)) {
      return 'Only PDF, JPG, and PNG files are supported.';
    }
    if (file.size > this.maxFileSizeBytes) {
      return 'File size must be 10MB or less.';
    }
    return null;
  }

  private parseRange(normalRange: string): { low: number; high: number } | null {
    const match = String(normalRange || '').match(/([-+]?\d+(?:\.\d+)?)\s*-\s*([-+]?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const low = Number(match[1]);
    const high = Number(match[2]);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
    return { low, high };
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      return String(err.error?.error || err.error?.message || err.message || 'Unable to process request right now.');
    }
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message?: unknown }).message || 'Unable to process request right now.');
    }
    return 'Unable to process request right now.';
  }
}
