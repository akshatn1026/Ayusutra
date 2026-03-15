import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AyurvedaDataService } from '../../services/ayurveda-data.service';
import { TherapyBookingRequest, TherapyRecord } from '../../models/ayurveda.models';

@Component({
  selector: 'app-panchakarma-book',
  templateUrl: './panchakarma-book.component.html',
  styleUrls: ['./panchakarma-book.component.scss']
})
export class PanchakarmaBookComponent implements OnInit {
  therapyId = '';
  date = '';
  status = '';
  progressNote = '';
  selectedTherapy: TherapyRecord | null = null;
  latestRequest: TherapyBookingRequest | null = null;
  eligibilityText = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private ayurvedaData: AyurvedaDataService
  ) {}

  ngOnInit(): void {
    const routeTherapyId = this.route.snapshot.paramMap.get('therapyId');
    this.therapyId = routeTherapyId || this.route.snapshot.queryParamMap.get('therapyId') || '';
    if (!this.therapyId) {
      this.status = 'Therapy id is missing.';
      return;
    }
    this.selectedTherapy = this.ayurvedaData.getTherapyById(this.therapyId) || null;
    const user = this.auth.getCurrentUser();
    if (!user) return;
    const latestDosha = this.auth.getLatestDoshaAssessment(user.id) || null;
    const patient = this.auth.getPatientData(user.id) as any;
    const eligibility = this.ayurvedaData.checkTherapyEligibility(this.therapyId, latestDosha, {
      age: Number(patient?.age || 0),
      isPregnant: !!patient?.isPregnant
    });
    this.eligibilityText =
      eligibility.outcome === 'eligible'
        ? `Eligible: ${eligibility.reason}`
        : eligibility.outcome === 'conditional'
          ? `Conditionally eligible: ${eligibility.reason}`
          : `Not recommended: ${eligibility.reason}`;
    this.latestRequest = this.ayurvedaData.getTherapyBookingsForPatient(user.id).find((r) => r.therapyId === this.therapyId) || null;
  }

  submit(): void {
    const user = this.auth.getCurrentUser();
    if (!user) {
      this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/panchakarma/book' } });
      return;
    }
    if (!this.therapyId || !this.date) {
      this.status = 'Select therapy and preferred date.';
      return;
    }
    const create = this.ayurvedaData.createTherapyBooking(user.id, this.therapyId, this.date);
    if (!create.success || !create.request) {
      this.status = create.error || 'Unable to submit request.';
      return;
    }
    this.ayurvedaData.createNotification(
      user.id,
      'therapy',
      'Therapy request submitted',
      `Your request for ${this.therapyId} is pending doctor review.`,
      ['inApp', 'email', 'sms']
    );
    this.latestRequest = create.request;
    this.status = 'Request submitted. Status: Pending Doctor Review.';
  }

  acknowledgeChecklist(): void {
    const user = this.auth.getCurrentUser();
    if (!user || !this.latestRequest) return;
    const result = this.ayurvedaData.acknowledgePreTherapyChecklist(user.id, this.latestRequest.id);
    this.status = result.success ? 'Pre-therapy checklist acknowledged.' : result.error || 'Unable to acknowledge checklist.';
    this.latestRequest = this.ayurvedaData.getTherapyBookingsForPatient(user.id).find((r) => r.id === this.latestRequest?.id) || null;
  }

  addProgressNote(): void {
    const user = this.auth.getCurrentUser();
    if (!user || !this.latestRequest) return;
    const result = this.ayurvedaData.addTherapyProgressNote(user.id, this.latestRequest.id, this.progressNote);
    this.status = result.success ? 'Progress note saved.' : result.error || 'Unable to save note.';
    if (result.success) this.progressNote = '';
    this.latestRequest = this.ayurvedaData.getTherapyBookingsForPatient(user.id).find((r) => r.id === this.latestRequest?.id) || null;
  }
}
