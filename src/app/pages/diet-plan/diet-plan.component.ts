import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AyurvedaDataService } from '../../services/ayurveda-data.service';
import { DietPlanRecord } from '../../models/ayurveda.models';
import { PdfExportService } from '../../services/pdf-export.service';
import { BookmarkService } from '../../services/bookmark.service';

@Component({
  selector: 'app-diet-plan',
  templateUrl: './diet-plan.component.html',
  styleUrls: ['./diet-plan.component.scss']
})
export class DietPlanComponent implements OnInit {
  plan: DietPlanRecord | null = null;
  loading = true;
  error = '';

  constructor(
    private auth: AuthService,
    private ayurvedaData: AyurvedaDataService,
    private router: Router,
    private route: ActivatedRoute,
    private pdfExport: PdfExportService,
    private bookmarks: BookmarkService
  ) {}

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    if (!user || user.role !== 'patient') {
      this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/diet-plan' } });
      return;
    }

    const assessment = this.auth.getLatestDoshaAssessment(user.id) || null;
    if (!assessment) {
      this.loading = false;
      this.router.navigate(['/dosha-assessment'], {
        queryParams: {
          source: 'diet-plan'
        }
      });
      return;
    }

    const storedPlan = this.ayurvedaData.getDietPlanForPatient(user.id) || null;
    const patientData = this.auth.getPatientData(user.id) as any;
    const selectedSeason = this.resolveSeasonFromQueryOrStorage(patientData);
    const dietaryPreference = this.resolveDietaryPreference(patientData);
    const foodAllergies = this.resolveFoodAllergies(patientData);

    const shouldRegenerate =
      !storedPlan ||
      storedPlan.assessmentId !== assessment.id ||
      storedPlan.season !== selectedSeason ||
      storedPlan.dietaryPreference !== dietaryPreference ||
      (storedPlan.foodAllergies || []).join('|') !== foodAllergies.join('|');

    try {
      this.plan = shouldRegenerate
        ? this.ayurvedaData.generateDietPlan({
            patientId: user.id,
            assessment,
            season: selectedSeason,
            dietaryPreference,
            foodAllergies,
            doctorRecommendations: this.resolveDoctorRecommendations(patientData)
          })
        : storedPlan;
    } catch {
      this.error = 'Unable to generate your personalized diet plan right now. Please try again.';
    }

    this.loading = false;
  }

  downloadPdf(): void {
    if (!this.plan) return;
    const lines: string[] = [
      `${this.plan.basis.line}`,
      `Pacify Dosha: ${this.plan.dosha}`,
      `Season: ${this.plan.season}`,
      `Prakriti: ${this.plan.basis.prakritiPrimary}${this.plan.basis.prakritiSecondary ? `-${this.plan.basis.prakritiSecondary}` : ''}`,
      `Vikriti: ${this.plan.basis.vikritiDominant} (${this.plan.basis.vikritiSeverity})`,
      `Generated: ${new Date(this.plan.generatedAt).toLocaleString()}`,
      ''
    ];
    this.plan.meals.forEach((m) => {
      lines.push(`${m.name}:`);
      (m.options || []).forEach((opt) => lines.push(`- ${opt.recommendation}: ${opt.item} (${opt.reason})`));
      if (!m.options || m.options.length === 0) lines.push(`- Recommended: ${m.items.join(', ')}`);
    });
    lines.push('');
    lines.push(`Avoid: ${this.plan.avoid.join(', ')}`);
    if (this.plan.tips?.length) {
      lines.push('');
      lines.push('Tips:');
      this.plan.tips.forEach((tip) => lines.push(`- ${tip}`));
    }
    this.pdfExport.downloadSimplePdf('ayusutra-diet-plan.pdf', 'Ayusutra Personalized Aahar Plan', lines);
  }

  get todaysFocus(): string {
    if (!this.plan) return 'Complete assessment to generate your daily focus.';
    return this.plan.meals[0]?.explanation || this.plan.basis.line;
  }

  get doshaExplanation(): string {
    if (!this.plan) return '';
    return `This plan is aligned to pacify ${this.plan.dosha} based on your latest prakriti-vikriti snapshot.`;
  }

  get complianceTips(): string[] {
    if (!this.plan) return [];
    const fromPlan = this.plan.tips || [];
    return fromPlan.length ? fromPlan.slice(0, 3) : ['Follow consistent meal timing.', 'Prefer warm freshly prepared food.', 'Review and adjust with your doctor during follow-up.'];
  }

  toggleMealBookmark(mealName: string): void {
    if (!this.plan) return;
    this.bookmarks.toggle('diet_meal', `${this.plan.id}:${mealName}`);
  }

  isMealBookmarked(mealName: string): boolean {
    if (!this.plan) return false;
    return this.bookmarks.isBookmarked('diet_meal', `${this.plan.id}:${mealName}`);
  }

  private resolveSeasonFromQueryOrStorage(patientData: any): DietPlanRecord['season'] {
    const querySeason = this.route.snapshot.queryParamMap.get('season');
    const candidate = querySeason || patientData?.preferredSeason || patientData?.season;
    if (
      candidate === 'vasanta' ||
      candidate === 'grishma' ||
      candidate === 'varsha' ||
      candidate === 'sharada' ||
      candidate === 'hemanta' ||
      candidate === 'shishira'
    ) {
      return candidate;
    }
    return this.autoDetectSeason();
  }

  private autoDetectSeason(): DietPlanRecord['season'] {
    const month = new Date().getMonth() + 1;
    if (month >= 3 && month <= 4) return 'vasanta';
    if (month >= 5 && month <= 6) return 'grishma';
    if (month >= 7 && month <= 8) return 'varsha';
    if (month >= 9 && month <= 10) return 'sharada';
    if (month >= 11 && month <= 12) return 'hemanta';
    return 'shishira';
  }

  private resolveDietaryPreference(patientData: any): 'veg' | 'sattvic' | undefined {
    const queryPreference = this.route.snapshot.queryParamMap.get('preference');
    const preference = (queryPreference || patientData?.dietaryPreference || '').toLowerCase();
    if (preference === 'veg') return 'veg';
    if (preference === 'sattvic') return 'sattvic';
    return undefined;
  }

  private resolveFoodAllergies(patientData: any): string[] {
    const raw = patientData?.foodAllergies;
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map((x) => String(x).trim().toLowerCase()).filter((x) => !!x);
    }
    if (typeof raw === 'string') {
      return raw
        .split(',')
        .map((x: string) => x.trim().toLowerCase())
        .filter((x: string) => !!x);
    }
    return [];
  }

  private resolveDoctorRecommendations(patientData: any): string[] {
    const recs = patientData?.doctorRecommendations;
    if (!Array.isArray(recs)) return [];
    return recs.map((x: string) => String(x).trim()).filter((x: string) => !!x);
  }
}
