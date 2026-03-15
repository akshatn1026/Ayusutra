import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AyurvedaDataService } from '../../services/ayurveda-data.service';
import { TherapyRecord } from '../../models/ayurveda.models';

@Component({
  selector: 'app-panchakarma',
  templateUrl: './panchakarma.component.html',
  styleUrls: ['./panchakarma.component.scss']
})
export class PanchakarmaComponent implements OnInit {
  therapies: TherapyRecord[] = [];
  selectedTherapyId = '';
  accessMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private ayurvedaData: AyurvedaDataService
  ) {}

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    if (!user) {
      this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/therapies' } });
      return;
    }
    const latest = this.auth.getLatestDoshaAssessment(user.id);
    if (!latest) {
      this.accessMessage = 'Therapy eligibility is personalized using your dosha profile. Please complete dosha assessment first.';
      this.router.navigate(['/dosha-assessment'], {
        queryParams: { reason: 'therapies-require-dosha' }
      });
      return;
    }
    this.therapies = this.ayurvedaData.getTherapies();
    this.selectedTherapyId =
      this.route.snapshot.paramMap.get('therapyId') || this.route.snapshot.queryParamMap.get('therapyId') || '';
  }

  get visibleTherapies(): TherapyRecord[] {
    if (!this.selectedTherapyId) return this.therapies;
    return this.therapies.filter((t) => t.id === this.selectedTherapyId || t.therapyId === this.selectedTherapyId);
  }

  getEligibilityText(therapyId: string): string {
    const user = this.auth.getCurrentUser();
    if (!user) return 'Login required';
    const latest = this.auth.getLatestDoshaAssessment(user.id) || null;
    const patient = this.auth.getPatientData(user.id) as any;
    const result = this.ayurvedaData.checkTherapyEligibility(therapyId, latest, {
      age: Number(patient?.age || 0),
      isPregnant: !!patient?.isPregnant
    });
    if (result.outcome === 'eligible') return `Eligible: ${result.reason}`;
    if (result.outcome === 'conditional') return `Conditionally eligible: ${result.reason}`;
    return `Not recommended: ${result.reason}`;
  }

  book(therapyId: string): void {
    this.router.navigate(['/therapies/request', therapyId]);
  }
}
