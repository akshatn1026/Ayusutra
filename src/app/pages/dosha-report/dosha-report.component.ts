import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, DoshaAssessmentRecord } from '../../services/auth.service';
import { AyurvedaDataService } from '../../services/ayurveda-data.service';
import { DoshaAssessmentService } from '../../services/dosha-assessment.service';

@Component({
  selector: 'app-dosha-report',
  templateUrl: './dosha-report.component.html',
  styleUrls: ['./dosha-report.component.scss']
})
export class DoshaReportComponent implements OnInit {
  report: DoshaAssessmentRecord | null = null;
  history: DoshaAssessmentRecord[] = [];
  loading = true;
  error = '';
  supportiveNotice = 'This assessment supports lifestyle personalization and is not a medical diagnosis.';

  constructor(
    private auth: AuthService,
    private ayurvedaData: AyurvedaDataService,
    private doshaApi: DoshaAssessmentService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    const user = this.auth.getCurrentUser();
    if (!user || user.role !== 'patient') {
      this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/dosha-report' } });
      return;
    }

    try {
      const response = await this.doshaApi.getAssessments(24);
      this.history = response.history || [];
      this.report = response.latest || null;
      this.auth.replaceDoshaAssessments(user.id, this.history);
      if (!this.report) this.error = 'No dosha assessment found. Please complete assessment first.';
    } catch (err: any) {
      this.report = this.auth.getLatestDoshaAssessment(user.id) || null;
      this.history = this.auth.getDoshaAssessments(user.id).slice(0, 24);
      if (!this.report) {
        this.error = err?.error?.error || err?.message || 'No dosha assessment found. Please complete assessment first.';
      }
    } finally {
      this.loading = false;
    }
  }

  get prakritiPrimary(): string {
    return this.report?.prakriti.primary || this.report?.primaryDosha || '';
  }

  get prakritiSecondary(): string {
    return this.report?.prakriti.secondary || this.report?.secondaryDosha || '';
  }

  get vikritiDominant(): string {
    return this.report?.vikriti.dominant || 'Balanced';
  }

  get vikritiSeverity(): string {
    return this.report?.vikriti.severity || 'Balanced';
  }

  get vataPercent(): number {
    return this.report?.prakriti.percentages.vata || 0;
  }

  get pittaPercent(): number {
    return this.report?.prakriti.percentages.pitta || 0;
  }

  get kaphaPercent(): number {
    return this.report?.prakriti.percentages.kapha || 0;
  }

  get confidence(): number {
    return Number(this.report?.confidence || 0);
  }

  get patternLine(): string {
    if (!this.report) return '';
    if (this.prakritiSecondary) {
      return `Your constitution shows a ${this.prakritiPrimary}-dominant pattern with mild ${this.prakritiSecondary} influence.`;
    }
    return `Your constitution shows a ${this.prakritiPrimary}-dominant pattern.`;
  }

  get whatThisMeans(): string {
    if (!this.report) return '';
    if (this.vikritiDominant === 'Balanced') {
      return 'Your current symptom pattern is relatively balanced, so focus on consistency in food, sleep, and routine.';
    }
    return `Your current pattern suggests ${this.vikritiSeverity.toLowerCase()} ${this.vikritiDominant} imbalance. Small daily corrections now can reduce escalation later.`;
  }

  get dailyImpactLine(): string {
    if (!this.report) return '';
    if (this.vikritiDominant === 'Vata') return 'You may notice irregular appetite, sleep, or energy when routine is not stable.';
    if (this.vikritiDominant === 'Pitta') return 'You may notice heat, acidity, or irritability when meals and stress are not managed.';
    if (this.vikritiDominant === 'Kapha') return 'You may notice heaviness, congestion, or low motivation when activity is low.';
    return 'Stable sleep timing and meal regularity help maintain your current balance.';
  }

  generateDietPlan(): void {
    const user = this.auth.getCurrentUser();
    if (!user || !this.report) return;
    this.ayurvedaData.generateDietPlan(user.id, this.report);
    this.router.navigate(['/diet-plan'], {
      queryParams: {
        prakriti: this.prakritiPrimary,
        vikriti: this.vikritiDominant
      }
    });
  }
}

