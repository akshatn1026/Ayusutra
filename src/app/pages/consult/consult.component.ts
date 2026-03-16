import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import {
  BookingDoctor,
  DoctorContinuityItem,
  BookingMode,
  BookingSlot,
  ConsultationBooking,
  ConsultationBookingService
} from '../../services/consultation-booking.service';
import { ToastService } from '../../services/toast.service';

type BookingStep = 1 | 2 | 3 | 4;

@Component({
  selector: 'app-consult',
  templateUrl: './consult.component.html',
  styleUrls: ['./consult.component.scss']
})
export class ConsultComponent implements OnInit, OnDestroy {
  @ViewChild('bookingFlow') bookingFlowRef?: ElementRef<HTMLElement>;
  loading = true;
  bookingLoading = false;
  doctorsLoading = false;
  slotsLoading = false;
  error = '';

  step: BookingStep = 1;
  mode: BookingMode = 'chat';
  recommendedMode: BookingMode = 'chat';
  urgency: 'low' | 'medium' | 'high' = 'medium';

  doctors: BookingDoctor[] = [];
  selectedDoctor: BookingDoctor | null = null;
  autoAssign = true;

  slots: BookingSlot[] = [];
  selectedSlot: BookingSlot | null = null;
  issueContext = '';
  issueSuggestions: string[] = [];

  bookingSuccess: { booking: ConsultationBooking; doctor: BookingDoctor } | null = null;
  upcomingConsultations: ConsultationBooking[] = [];
  pastConsultations: ConsultationBooking[] = [];
  continuityDoctors: DoctorContinuityItem[] = [];
  suggestedAlternatives: string[] = [];
  selectedModeDescription = '';
  networkHint = '';

  private slotRefreshRef: ReturnType<typeof setInterval> | null = null;

  constructor(
    private auth: AuthService,
    private bookingService: ConsultationBookingService,
    private route: ActivatedRoute,
    private router: Router,
    private toast: ToastService
  ) {}

  async ngOnInit(): Promise<void> {
    const user = this.auth.getCurrentUser();
    if (!user) {
      this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/consult' } });
      return;
    }
    if (user.role !== 'patient') {
      await this.loadHistory();
      this.loading = false;
      return;
    }

    this.bootstrapIssueContext();
    try {
      const recommendation = await this.bookingService.getRecommendation({
        issue: this.issueContext,
        urgency: this.urgency
      });
      this.mode = recommendation.mode;
      this.recommendedMode = recommendation.mode;
      this.selectedModeDescription = this.modeDescription(this.mode);
      if (!this.issueContext) this.issueContext = recommendation.issueSuggestion || '';
    } catch {
      this.mode = 'chat';
      this.recommendedMode = 'chat';
      this.selectedModeDescription = this.modeDescription(this.mode);
    }

    await Promise.all([this.loadDoctors(), this.loadHistory(), this.loadContinuity()]);
    const rebookDoctorId = String(this.route.snapshot.queryParamMap.get('rebookDoctorId') || '').trim();
    if (rebookDoctorId) {
      const doctor = this.doctors.find((d) => d.id === rebookDoctorId) || null;
      if (doctor) {
        this.autoAssign = false;
        this.selectedDoctor = doctor;
        this.step = 3;
        await this.loadSlots();
      }
    }
    this.loading = false;
  }

  ngOnDestroy(): void {
    if (this.slotRefreshRef) clearInterval(this.slotRefreshRef);
  }

  async onModeSelected(mode: BookingMode): Promise<void> {
    this.mode = mode;
    this.selectedModeDescription = this.modeDescription(mode);
    this.selectedDoctor = null;
    this.selectedSlot = null;
    this.autoAssign = true;
    await this.loadDoctors();
    this.step = 2;
  }

  async onChooseDoctor(doctor: BookingDoctor): Promise<void> {
    this.autoAssign = false;
    this.selectedDoctor = doctor;
    this.step = 2;
    await this.loadSlots();
  }

  async onAutoAssign(): Promise<void> {
    this.autoAssign = true;
    this.selectedDoctor = null;
    this.step = 2;
    this.slots = [];
    this.selectedSlot = null;
  }

  selectSlot(slot: BookingSlot): void {
    this.selectedSlot = slot;
    this.suggestedAlternatives = [];
    this.step = 3;
  }

  moveToConfirm(): void {
    if (!this.autoAssign && !this.selectedSlot) return;
    this.step = 3;
  }

  async confirmBooking(): Promise<void> {
    const autoSlot = this.doctors.find((d) => !!d.nextAvailableSlot)?.nextAvailableSlot || '';
    const scheduledTime = this.selectedSlot?.startAt || autoSlot;
    const duration = this.selectedSlot?.durationMinutes || 30;
    if (!scheduledTime) {
      this.error = 'No available slot found. Please refresh and try again.';
      return;
    }
    this.bookingLoading = true;
    this.error = '';
    this.suggestedAlternatives = [];
    try {
      const response = await this.bookingService.book({
        mode: this.mode,
        scheduledTime,
        duration,
        issueContext: this.issueContext,
        autoAssign: this.autoAssign,
        doctorId: this.autoAssign ? undefined : this.selectedDoctor?.id
      });
      this.bookingSuccess = response;
      this.step = 4;
      this.toast.show('Consultation booked successfully.', 'success');
      await this.loadHistory();
      await this.loadDoctors();
    } catch (err: any) {
      const msg = err?.error?.error || 'Unable to confirm booking.';
      this.error = msg;
      const alternatives = Array.isArray(err?.error?.alternatives) ? err.error.alternatives : [];
      this.suggestedAlternatives = alternatives;
      if (msg.toLowerCase().includes('slot')) {
        this.toast.show('That slot was just booked. Here are the next available options.', 'warning');
        await this.loadSlots();
        this.step = 2;
      }
    } finally {
      this.bookingLoading = false;
    }
  }

  async openSession(booking: ConsultationBooking): Promise<void> {
    if (booking.status !== 'scheduled' && booking.status !== 'confirmed') return;
    const rid = booking.room_id || (booking as any).room_id;
    if (!rid) {
      this.toast.show('Consultation room not ready yet.', 'info');
      return;
    }
    await this.router.navigate(['/consult/room', rid]);
  }

  async cancelBooking(booking: ConsultationBooking): Promise<void> {
    if (booking.status !== 'scheduled') return;
    try {
      await this.bookingService.cancelBooking(booking.id, 'Cancelled by patient');
      this.toast.show('Booking cancelled.', 'success');
      await this.loadHistory();
      await this.loadSlots();
      await this.loadDoctors();
    } catch (err: any) {
      this.toast.show(err?.error?.error || 'Unable to cancel booking.', 'error');
    }
  }

  resetFlow(): void {
    this.step = 1;
    this.selectedDoctor = null;
    this.selectedSlot = null;
    this.bookingSuccess = null;
    this.error = '';
    this.suggestedAlternatives = [];
  }

  async rebookSameDoctor(doctorId: string, issue = ''): Promise<void> {
    if (!doctorId) return;
    if (issue && !this.issueContext.trim()) this.issueContext = issue;
    this.autoAssign = false;
    if (!this.doctors.length) await this.loadDoctors();
    this.selectedDoctor = this.doctors.find((d) => d.id === doctorId) || null;
    if (!this.selectedDoctor) {
      this.toast.show('Doctor is currently unavailable. You can use auto-assign.', 'warning');
      this.step = 2;
      return;
    }
    this.step = 2;
    await this.loadSlots();
  }

  get isPatient(): boolean {
    return this.auth.getCurrentUser()?.role === 'patient';
  }

  get selectedDoctorLabel(): string {
    if (this.autoAssign) return 'Auto-assign best available doctor';
    return this.selectedDoctor?.name || 'Select doctor';
  }

  formatSlot(slot: string): string {
    return new Date(slot).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  scrollToBooking(): void {
    if (this.bookingFlowRef?.nativeElement) {
      this.bookingFlowRef.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  modeDescription(mode: BookingMode): string {
    if (mode === 'audio') return 'Best for quick voice clarity and deeper context.';
    if (mode === 'video') return 'Best for high urgency or when visual assessment helps.';
    return 'Best for the fastest first response and low-friction follow-up.';
  }

  modeLabel(mode: BookingMode): string {
    return mode === 'audio' ? 'Audio Call' : mode === 'video' ? 'Video Call' : 'Chat';
  }

  isDoctorRecommended(doctor: BookingDoctor): boolean {
    if (!doctor?.nextAvailableSlot) return false;
    const top = this.doctors
      .filter((d) => !!d.nextAvailableSlot)
      .sort((a, b) => {
        const timeDiff =
          new Date(String(a.nextAvailableSlot || '')).getTime() -
          new Date(String(b.nextAvailableSlot || '')).getTime();
        if (timeDiff !== 0) return timeDiff;
        if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
        return Number(b.experienceYears || 0) - Number(a.experienceYears || 0);
      })[0];
    return !!top && top.id === doctor.id;
  }

  private bootstrapIssueContext(): void {
    const qIssue = String(this.route.snapshot.queryParamMap.get('issue') || '').trim();
    const fromAi = this.route.snapshot.queryParamMap.get('fromAi') === '1';
    const attachAssessment = String(this.route.snapshot.queryParamMap.get('attachAssessment') || '').trim();
    const latestAssessment = this.auth.getLatestDoshaAssessment(this.auth.getCurrentUser()?.id || '');
    const assessmentHint =
      latestAssessment && attachAssessment
        ? `${latestAssessment.vikriti.dominant} imbalance (${latestAssessment.vikriti.severity})`
        : '';

    this.issueSuggestions = [
      assessmentHint ? `Recent dosha finding: ${assessmentHint}` : '',
      fromAi ? 'Persistent symptoms discussed with AI assistant' : '',
      'Digestive issues and irregular appetite',
      'Stress, sleep disturbance, and fatigue'
    ].filter(Boolean);

    this.issueContext = qIssue || this.issueSuggestions[0] || '';
  }

  private async loadDoctors(): Promise<void> {
    this.doctorsLoading = true;
    this.networkHint = '';
    try {
      this.doctors = await this.bookingService.getDoctors(this.mode, this.issueContext);
      this.doctors = [...this.doctors].sort((a, b) => {
        const aAvail = a.nextAvailableSlot ? 1 : 0;
        const bAvail = b.nextAvailableSlot ? 1 : 0;
        if (aAvail !== bAvail) return bAvail - aAvail;
        if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
        return Number(b.experienceYears || 0) - Number(a.experienceYears || 0);
      });
      if (!this.autoAssign && this.selectedDoctor) {
        this.selectedDoctor = this.doctors.find((d) => d.id === this.selectedDoctor?.id) || null;
      }
    } catch (err: any) {
      this.error = err?.error?.error || 'Unable to load doctors.';
      this.networkHint = 'Network is slow. Retrying doctor availability can help.';
      this.doctors = [];
    } finally {
      this.doctorsLoading = false;
    }
  }

  private async loadSlots(): Promise<void> {
    if (this.slotRefreshRef) clearInterval(this.slotRefreshRef);
    if (this.autoAssign || !this.selectedDoctor?.id) return;

    const refresh = async () => {
      this.slotsLoading = true;
      try {
        this.slots = await this.bookingService.getAvailability(this.selectedDoctor!.id, this.mode, 7);
        if (this.selectedSlot) {
          this.selectedSlot = this.slots.find((slot) => slot.startAt === this.selectedSlot?.startAt) || null;
        }
      } catch (err: any) {
        this.error = err?.error?.error || 'Unable to load availability.';
        this.networkHint = 'Availability refresh delayed. Please retry in a few seconds.';
        this.slots = [];
      } finally {
        this.slotsLoading = false;
      }
    };

    await refresh();
    this.slotRefreshRef = setInterval(() => {
      void refresh();
    }, 10000);
  }

  private async loadHistory(): Promise<void> {
    try {
      const history = await this.bookingService.getMyBookings();
      this.upcomingConsultations = history.upcoming;
      this.pastConsultations = history.past;
    } catch {
      this.upcomingConsultations = [];
      this.pastConsultations = [];
    }
  }

  private async loadContinuity(): Promise<void> {
    if (!this.isPatient) return;
    try {
      this.continuityDoctors = await this.bookingService.getContinuity(5);
    } catch {
      this.continuityDoctors = [];
    }
  }
}
