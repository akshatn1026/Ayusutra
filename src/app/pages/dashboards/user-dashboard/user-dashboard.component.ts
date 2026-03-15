import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService, DoshaAssessmentRecord, PatientData, User } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { Router } from '@angular/router';
import { ConsultationBooking, ConsultationBookingService } from '../../../services/consultation-booking.service';
import { GuidanceItem, GuidanceFeedbackType, PersonalizedGuidanceService } from '../../../services/personalized-guidance.service';
import { AyurvedaDataService } from '../../../services/ayurveda-data.service';
import { DailySymptomLog, SymptomSeverity, SymptomTrackingService } from '../../../services/symptom-tracking.service';
import { HealthTimelineEvent, HealthTimelineService } from '../../../services/health-timeline.service';
import { SupabaseService } from '../../../core/services/supabase.service';

interface InsightCard {
  id: string;
  label: string;
  value: number;
  target: number;
  unit?: string;
}

interface ActivityItem {
  id: string;
  title: string;
  subtitle: string;
  at: string;
}

interface QuickAction {
  id: string;
  label: string;
  description: string;
  path?: string;
  type: 'navigate' | 'modal';
  enabled: boolean;
}

@Component({
  selector: 'app-user-dashboard',
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.scss']
})
export class UserDashboardComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  patientData: PatientData | null = null;
  latestAssessment: DoshaAssessmentRecord | null = null;
  myPrescriptions: any[] = [];

  isLoading = true;
  loadError = '';
  nowLabel = '';
  lastLoginLabel = 'First login on this device';
  profileCompletion = 0;

  insights: InsightCard[] = [];
  activities: ActivityItem[] = [];
  quickActions: QuickAction[] = [];
  upcomingBookings: ConsultationBooking[] = [];
  pastBookings: ConsultationBooking[] = [];
  guidanceItems: GuidanceItem[] = [];
  guidanceAdvisory = 'Supportive wellness guidance only.';
  isGuidanceLoading = false;
  guidanceError = '';
  guidanceContextVersion = '';
  symptomLogs: DailySymptomLog[] = [];
  symptomQuickOptions = ['Bloating', 'Acidity', 'Constipation', 'Headache', 'Low energy', 'Poor sleep'];
  symptomInput = '';
  symptomSeverity: SymptomSeverity = 'Medium';
  symptomNote = '';
  isSymptomLoading = false;
  isSymptomSaving = false;
  symptomError = '';

  showBookingModal = false;
  showConsultNowModal = false;
  isStartingInstant = false;
  availableDoctors: string[] = [];
  booking = { doctor: '', date: '', time: '', status: 'Pending' };

  isRequestingEmergency = false;
  private channel: any = null;

  private refreshTimer: any = null;
  private clockTimer: any = null;
  private lastGuidanceLoadedAt = 0;
  private lastSymptomsLoadedAt = 0;
  private lastTimelineLoadedAt = 0;

  constructor(
    private authService: AuthService,
    private toast: ToastService,
    private router: Router,
    private consultationBookingService: ConsultationBookingService,
    private guidanceService: PersonalizedGuidanceService,
    private ayurvedaData: AyurvedaDataService,
    private symptomTracking: SymptomTrackingService,
    private healthTimeline: HealthTimelineService,
    private http: HttpClient,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
    this.clockTimer = setInterval(() => {
      this.nowLabel = new Date().toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }, 30000);
    this.setupRealtimeListeners();
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.cleanupRealtime();
  }

  retryLoad(): void {
    this.loadDashboard();
  }

  get greetingTitle(): string {
    const name = this.currentUser?.fullName || this.patientData?.name || 'User';
    const hour = new Date().getHours();
    const prefix = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return `${prefix}, ${name}`;
  }

  openBooking(): void {
    this.showBookingModal = true;
  }

  closeBooking(): void {
    this.showBookingModal = false;
  }

  openConsultNow(): void {
    this.showConsultNowModal = true;
  }

  closeConsultNow(): void {
    this.showConsultNowModal = false;
  }

  submitBooking(): void {
    if (!this.patientData) return;
    const appointment = { ...this.booking };
    if (!appointment.doctor || !appointment.date || !appointment.time) {
      this.toast.show('Please complete doctor, date, and time.', 'error');
      return;
    }

    const idx = this.authService.addAppointmentAndReturnIndex(this.patientData.id, appointment as any);
    if (idx === null) {
      this.toast.show('Unable to create appointment.', 'error');
      return;
    }

    this.refreshUserData();
    this.booking = { doctor: this.availableDoctors[0] || '', date: '', time: '', status: 'Pending' };
    this.showBookingModal = false;
    this.toast.show('Appointment scheduled.', 'success', 6000, 'Undo', () => {
      if (!this.patientData) return;
      this.authService.removeAppointment(this.patientData.id, idx);
      this.refreshUserData();
    });
  }

  private setupRealtimeListeners(): void {
    const user = this.authService.getCurrentUser();
    if (!user) return;
    this.channel = this.supabaseService.client
      .channel('doctor_alerts')
      .on('broadcast', { event: `emergency-accepted-${user.id}` }, (payload: any) => {
        const data = payload.payload;
        this.handleAcceptedRequest(data, 'Emergency');
      })
      .on('broadcast', { event: `consult-accepted-${user.id}` }, (payload: any) => {
        const data = payload.payload;
        this.handleAcceptedRequest(data, 'Consultation');
      })
      .subscribe();
  }

  private handleAcceptedRequest(data: any, type: string): void {
    this.toast.show(`${type} request accepted by ${data.doctorName}. Connecting...`, 'success');
    this.isRequestingEmergency = false;
    this.isStartingInstant = false;
    this.closeConsultNow();
    this.ayurvedaData.startConsultation({
      patientId: this.currentUser!.id,
      doctorId: data.doctorId,
      initiationType: 'instant'
    });
    this.router.navigate(['/consult/session', data.sessionId]);
  }

  private cleanupRealtime(): void {
    if (this.channel) {
      this.supabaseService.client.removeChannel(this.channel);
      this.channel = null;
    }
  }

  async startInstantConsultation(mode: 'chat' | 'audio' | 'video'): Promise<void> {
    const user = this.currentUser;
    if (!user) return;
    
    if (!this.channel) {
      this.setupRealtimeListeners();
    }

    this.isStartingInstant = true;
    this.toast.show('Finding an available doctor...', 'info');

    this.channel.send({
      type: 'broadcast',
      event: 'consult-request',
      payload: {
        patientId: user.id,
        patientName: user.fullName || 'Patient',
        consultationType: mode
      }
    });

    setTimeout(() => {
      if (this.isStartingInstant) {
         this.isStartingInstant = false;
         this.toast.show('No doctors available at the moment. Please try again or book a regular appointment.', 'error');
      }
    }, 45000);
  }

  runAction(action: QuickAction): void {
    if (!action.enabled) return;
    if (action.id === 'book') {
      this.openConsultNow();
      return;
    }
    if (action.type === 'modal') {
      this.openBooking();
      return;
    }
    if (action.path) {
      this.router.navigate([action.path]);
    }
  }

  formatActivityTime(value: string): string {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private loadDashboard(): void {
    this.isLoading = true;
    this.loadError = '';

    try {
      const user = this.authService.getCurrentUser();
      if (!user || user.role !== 'patient') {
        throw new Error('Session unavailable. Please login again.');
      }

      this.currentUser = user;
      this.availableDoctors = this.authService.getDoctors().map((d) => d.fullName).filter(Boolean);
      this.booking.doctor = this.availableDoctors[0] || '';
      this.resolveLastLogin(user.id);
      this.nowLabel = new Date().toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      void this.refreshUserData();
      if (this.refreshTimer) clearInterval(this.refreshTimer);
      this.refreshTimer = setInterval(() => void this.refreshUserData(), 15000);
      this.isLoading = false;
    } catch (err: any) {
      this.loadError = err?.message || 'Unable to load dashboard.';
      this.isLoading = false;
    }
  }

  private async refreshUserData(): Promise<void> {
    const user = this.currentUser;
    if (!user) return;
    const patient = this.authService.getPatientData(user.id);
    if (!patient) {
      this.loadError = 'Profile not found.';
      return;
    }

    this.patientData = patient;
    this.latestAssessment = this.authService.getLatestDoshaAssessment(user.id) || null;
    this.profileCompletion = this.computeProfileCompletion(user, patient);
    this.insights = this.buildInsights(patient);
    if (Date.now() - this.lastTimelineLoadedAt > 45 * 1000) {
      await this.loadTimelineActivity(patient);
    }
    this.quickActions = this.buildQuickActions();
    await this.loadBookingSnapshot();
    if (Date.now() - this.lastSymptomsLoadedAt > 60 * 1000) {
      void this.loadSymptomLogs();
    }
    if (Date.now() - this.lastGuidanceLoadedAt > 60 * 1000) {
      void this.loadGuidance(false);
    }
    this.loadMyPrescriptions(user.id);
    this.animateInsightCounters();
  }

  private buildInsights(patient: PatientData): InsightCard[] {
    const appointments = patient.appointments || [];
    const upcoming = appointments.filter((a) => new Date(`${a.date} ${a.time}`).getTime() >= Date.now()).length;
    const milestones = (patient.recoveryMilestones || []).length;
    const score = Math.max(0, Math.min(100, patient.recoveryProgress || 0));
    const assessments = this.latestAssessment ? 1 : 0;

    return [
      { id: 'upcoming', label: 'Upcoming Appointments', value: 0, target: upcoming },
      { id: 'wellness', label: 'Wellness Score', value: 0, target: score, unit: '%' },
      { id: 'milestones', label: 'Milestones', value: 0, target: milestones },
      { id: 'assessments', label: 'Latest Assessment', value: 0, target: assessments }
    ];
  }

  private buildActivityFallback(patient: PatientData): ActivityItem[] {
    const rows: ActivityItem[] = [];

    (patient.recoveryMilestones || []).forEach((m, i) => {
      rows.push({
        id: `milestone_${i}`,
        title: m.milestone,
        subtitle: `Recovery progress: ${m.progress}%`,
        at: new Date(m.date).toISOString()
      });
    });

    (patient.appointments || []).forEach((a, i) => {
      rows.push({
        id: `appointment_${i}`,
        title: `Appointment with ${a.doctor}`,
        subtitle: `Status: ${a.status}`,
        at: new Date(`${a.date} ${a.time}`).toISOString()
      });
    });

    if (this.latestAssessment) {
      rows.push({
        id: `assessment_${this.latestAssessment.id}`,
        title: `Dosha assessment submitted (${this.latestAssessment.result})`,
        subtitle: `Vikriti: ${this.latestAssessment.vikriti?.dominant || 'Balanced'}`,
        at: this.latestAssessment.submittedAt
      });
    }

    return rows
      .filter((x) => !!x.at && !Number.isNaN(new Date(x.at).getTime()))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 10);
  }

  private async loadTimelineActivity(patient: PatientData): Promise<void> {
    try {
      const events = await this.healthTimeline.getTimeline(80);
      this.activities = this.mapTimelineToActivity(events).slice(0, 10);
      this.lastTimelineLoadedAt = Date.now();
      if (!this.activities.length) {
        this.activities = this.buildActivityFallback(patient);
      }
    } catch {
      this.activities = this.buildActivityFallback(patient);
    }
  }

  private mapTimelineToActivity(events: HealthTimelineEvent[]): ActivityItem[] {
    return (events || [])
      .filter((event) => !!event?.occurredAt && !!event?.title)
      .map((event) => ({
        id: String(event.id || `timeline_${event.createdAt || Date.now()}`),
        title: String(event.title || 'Health event'),
        subtitle: String(event.details || this.describeTimelineEvent(event)),
        at: String(event.occurredAt || event.createdAt || new Date().toISOString())
      }))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }

  private describeTimelineEvent(event: HealthTimelineEvent): string {
    const type = String(event.eventType || '').toLowerCase();
    if (type === 'consultation_booked') return 'Consultation scheduled successfully.';
    if (type === 'consultation_cancelled') return 'Consultation booking was cancelled.';
    if (type === 'dosha_assessment') return 'Dosha reassessment updated your care context.';
    if (type === 'symptom_logged') return 'Daily symptom entry added.';
    if (type === 'guidance_feedback') return 'Guidance preference feedback captured.';
    return 'Health timeline updated.';
  }

  private buildQuickActions(): QuickAction[] {
    return [
      {
        id: 'book',
        label: 'Consult Now',
        description: 'Book a doctor in under 60 seconds',
        path: '/consult',
        type: 'navigate',
        enabled: true
      },
      {
        id: 'dosha',
        label: 'Dosha Reassessment',
        description: 'Update constitution and imbalance snapshot',
        path: '/dosha-assessment',
        type: 'navigate',
        enabled: true
      },
      {
        id: 'consult',
        label: 'Open Consultations',
        description: 'View active and past consult sessions',
        path: '/consult',
        type: 'navigate',
        enabled: true
      },
      {
        id: 'diet',
        label: 'View Diet Plan',
        description: 'Open your current care diet plan',
        path: '/diet-plan',
        type: 'navigate',
        enabled: true
      },
      {
        id: 'assistant',
        label: 'AI Assistant',
        description: 'Ask medical wellness questions',
        path: '/ai-assistant',
        type: 'navigate',
        enabled: true
      }
    ];
  }

  private computeProfileCompletion(user: User, patient: PatientData): number {
    const checks = [
      !!user.fullName?.trim(),
      !!user.email?.trim(),
      !!user.phone?.trim(),
      !!patient.wellnessMessage?.trim(),
      !!this.latestAssessment
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }

  private animateInsightCounters(): void {
    this.insights.forEach((card) => {
      const start = card.value;
      const target = card.target;
      const steps = 12;
      let step = 0;
      const delta = (target - start) / steps;
      const timer = setInterval(() => {
        step += 1;
        card.value = step >= steps ? target : Math.round(start + delta * step);
        if (step >= steps) clearInterval(timer);
      }, 24);
    });
  }

  private resolveLastLogin(userId: string): void {
    const key = `ayustra_last_login_${userId}`;
    const prev = localStorage.getItem(key);
    if (prev) this.lastLoginLabel = new Date(prev).toLocaleString();
    localStorage.setItem(key, new Date().toISOString());
  }

  async startConsultationFromBooking(booking: ConsultationBooking): Promise<void> {
    if (!booking.doctorId) return;
    await this.router.navigate(['/consult', booking.doctorId], {
      queryParams: { bookingId: booking.id }
    });
  }

  async rebook(booking: ConsultationBooking): Promise<void> {
    await this.router.navigate(['/consult'], {
      queryParams: {
        issue: booking.issueContext || '',
        rebookDoctorId: booking.doctorId
      }
    });
  }

  private async loadBookingSnapshot(): Promise<void> {
    try {
      const snapshot = await this.consultationBookingService.getMyBookings();
      this.upcomingBookings = snapshot.upcoming.slice(0, 5);
      this.pastBookings = snapshot.past.slice(0, 5);
    } catch {
      this.upcomingBookings = [];
      this.pastBookings = [];
    }
  }

  async refreshGuidance(force = true): Promise<void> {
    await this.loadGuidance(force);
  }

  async onGuidanceFeedback(item: GuidanceItem, feedbackType: GuidanceFeedbackType): Promise<void> {
    try {
      await this.guidanceService.submitFeedback(item.id, feedbackType);
      if (feedbackType === 'dismissed') {
        this.guidanceItems = this.guidanceItems.filter((g) => g.id !== item.id);
      }
      if (feedbackType === 'saved') {
        this.guidanceItems = this.guidanceItems.map((g) => (g.id === item.id ? { ...g, isSaved: true } : g));
      }
      const labelMap: Record<GuidanceFeedbackType, string> = {
        helpful: 'Marked as helpful. We will prioritize similar guidance.',
        ignored: 'Noted. We will reduce similar suggestions.',
        saved: 'Guidance saved for later.',
        dismissed: 'Guidance dismissed.'
      };
      this.toast.show(labelMap[feedbackType], 'success');
    } catch {
      this.toast.show('Unable to save feedback right now.', 'error');
    }
  }

  guidanceTypeLabel(type: GuidanceItem['type']): string {
    const map: Record<GuidanceItem['type'], string> = {
      daily: 'Daily Guidance',
      condition: 'Condition Focus',
      dosha_balancing: 'Dosha Balance',
      post_consultation: 'Post Consultation',
      preventive: 'Preventive Care',
      safety: 'Safety Alert'
    };
    return map[type] || 'Guidance';
  }

  async reassessDosha(): Promise<void> {
    await this.router.navigate(['/dosha-assessment'], { queryParams: { source: 'guidance' } });
  }

  async logQuickSymptom(symptomLabel?: string): Promise<void> {
    const symptom = (symptomLabel || this.symptomInput || '').trim();
    if (!symptom || symptom.length < 2) {
      this.symptomError = 'Add a symptom (at least 2 characters).';
      return;
    }
    this.isSymptomSaving = true;
    this.symptomError = '';
    try {
      const entry = await this.symptomTracking.logSymptom({
        symptom,
        severity: this.symptomSeverity,
        note: this.symptomNote.trim()
      });
      this.symptomLogs = [entry, ...this.symptomLogs.filter((item) => item.id !== entry.id)].slice(0, 10);
      this.symptomInput = '';
      this.symptomNote = '';
      this.lastSymptomsLoadedAt = Date.now();
      this.toast.show('Symptom logged. Guidance updated.', 'success');
      await this.loadGuidance(true);
    } catch (err: any) {
      this.symptomError = err?.error?.error || 'Unable to save symptom right now.';
    } finally {
      this.isSymptomSaving = false;
    }
  }

  setSymptomSeverity(severity: SymptomSeverity): void {
    this.symptomSeverity = severity;
  }

  formatSymptomDate(value: string): string {
    if (!value) return '';
    return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  private async loadSymptomLogs(): Promise<void> {
    const user = this.currentUser;
    if (!user || user.role !== 'patient') return;
    this.isSymptomLoading = true;
    this.symptomError = '';
    try {
      const response = await this.symptomTracking.getRecent(14);
      this.symptomLogs = (response.recent || []).slice(0, 10);
      this.lastSymptomsLoadedAt = Date.now();
    } catch {
      this.symptomLogs = [];
      this.symptomError = 'Unable to load symptom history right now.';
    } finally {
      this.isSymptomLoading = false;
    }
  }

  private async loadGuidance(force = false): Promise<void> {
    const user = this.currentUser;
    if (!user || user.role !== 'patient') return;
    this.isGuidanceLoading = true;
    this.guidanceError = '';
    try {
      const response = force ? await this.guidanceService.refreshGuidance() : await this.guidanceService.getGuidance(false);
      this.guidanceItems = (response.items || []).slice(0, 5);
      this.guidanceAdvisory = response.advisory || this.guidanceAdvisory;
      this.guidanceContextVersion = response.contextVersion || '';
      this.lastGuidanceLoadedAt = Date.now();
      this.publishGuidanceNotifications(response.items || [], response.contextVersion || '');
    } catch {
      this.guidanceError = 'Guidance is temporarily unavailable. Please retry.';
      this.guidanceItems = [];
    } finally {
      this.isGuidanceLoading = false;
    }
  }

  private publishGuidanceNotifications(items: GuidanceItem[], contextVersion: string): void {
    const user = this.currentUser;
    if (!user) return;
    const key = `ayustra_guidance_notif_${user.id}`;
    const previous = localStorage.getItem(key);
    if (previous === contextVersion || !contextVersion) return;
    const highPriority = items
      .filter((item) => item.priority >= 85 || item.type === 'safety')
      .slice(0, 2);
    for (const item of highPriority) {
      this.ayurvedaData.createNotification(
        user.id,
        'general',
        this.guidanceTypeLabel(item.type),
        `${item.content} (${item.whenToFollow})`,
        ['inApp'],
        {
          contextKey: `guidance:${item.id}:${contextVersion}`,
          valueScore: Math.max(70, Number(item.priority || 70))
        }
      );
    }
    localStorage.setItem(key, contextVersion);
  }

  private loadMyPrescriptions(patientId: string): void {
    this.http.get<any>(`/api/prescriptions/patient/${patientId}`).subscribe({
      next: (res) => {
        if (res.success) {
          this.myPrescriptions = res.prescriptions;
        }
      },
      error: () => {
        console.error('Failed to load prescriptions');
      }
    });
  }

  downloadRealPdf(pdfUrl: string): void {
    if (!pdfUrl) return;
    window.open(pdfUrl, '_blank');
  }

  requestEmergencyConsult(): void {
    const user = this.authService.getCurrentUser();
    if (!user) return;
    
    if (!this.channel) {
      this.setupRealtimeListeners();
    }
    
    const confirm = window.confirm("Are you sure you want to request an emergency consultation? Online doctors will be alerted instantly.");
    if (!confirm) return;

    this.isRequestingEmergency = true;
    this.channel.send({
      type: 'broadcast',
      event: 'emergency-request',
      payload: {
        patientId: user.id,
        patientName: user.fullName || 'Patient'
      }
    });
    this.toast.show('Emergency request broadcasted. Waiting for an available doctor...', 'success');

    setTimeout(() => {
      if (this.isRequestingEmergency) {
         this.isRequestingEmergency = false;
         this.toast.show('No doctors available at the moment. Please try again or book a regular appointment.', 'error');
      }
    }, 30000);
  }
}
