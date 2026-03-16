import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService, DoshaAssessmentRecord, PatientData, User } from '../../../services/auth.service';
import { AyurvedaDataService, RoutinePlanRecord } from '../../../services/ayurveda-data.service';
import { DietPlanRecord, TherapyBookingRequest } from '../../../models/ayurveda.models';
import { ToastService } from '../../../services/toast.service';
import { ConsultationBooking, ConsultationBookingService } from '../../../services/consultation-booking.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Router } from '@angular/router';
import { AvailabilityService } from '../../../services/availability.service';

@Component({
  selector: 'app-doctor-dashboard',
  templateUrl: './doctor-dashboard.component.html',
  styleUrls: ['./doctor-dashboard.component.scss']
})
export class DoctorDashboardComponent implements OnInit, OnDestroy {
  patients: PatientData[] = [];
  selectedPatient: PatientData | null = null;
  doctorName = 'Doctor';
  therapyReviewNotes: Record<string, string> = {};
  todaySchedule: ConsultationBooking[] = [];
  consultationHistory: ConsultationBooking[] = [];
  isPrescriptionModalOpen = false;
  selectedConsultationId = '';
  isLoading = true;
  loadError = '';
  totalOnlineMinutesToday = 0;
  lastStatusChange: string | null = null;

  incomingRequests: { type: 'emergency'|'standard', patientId: string, patientName: string, consultationType?: string, timestamp: string, room_id?: string }[] = [];
  private channel: any = null;
  private refreshTimer: any;
  currentUser: User | null = null;
  isOnline = false;
  dailyLimitMinutes = 120; // 2 hours

  constructor(
    private authService: AuthService,
    private ayurvedaData: AyurvedaDataService,
    private toast: ToastService,
    private consultationBookingService: ConsultationBookingService,
    private router: Router,
    private supabaseService: SupabaseService,
    private availabilityService: AvailabilityService
  ) {}

  async ngOnInit(): Promise<void> {
    this.currentUser = this.authService.getCurrentUser();
    try {
      await this.loadDashboard();
      this.availabilityService.onlineMinutes.subscribe(m => this.totalOnlineMinutesToday = m);
      this.availabilityService.onlineStatus.subscribe(s => this.isOnline = s);
    } catch (error: any) {
      this.loadError = 'Failed to load dashboard data.';
    } finally {
      this.isLoading = false;
    }
    this.refreshTimer = setInterval(() => this.reloadDashboardQuietly(), 20000);
    this.setupRealtimeListeners();
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.cleanupRealtime();
  }

  async loadDashboard(): Promise<void> {
    const doctor = this.authService.getCurrentUser();
    if (!doctor || doctor.role !== 'doctor') return;
    const doctorId = doctor.id;
    if (doctor.fullName) this.doctorName = doctor.fullName;

    this.patients = this.authService.getPatientsForDoctor(doctorId);

    if (this.patients && this.patients.length > 0) {
      this.selectedPatient = this.patients[0];
    }
    await this.loadConsultationSchedule();
  }

  async reloadDashboardQuietly(): Promise<void> {
    await this.loadConsultationSchedule(); // Keep schedule updated
  }

  selectPatient(patient: PatientData): void {
    this.selectedPatient = patient;
  }

  confirmAppointment(patientId: string, index: number): void {
    const patient = this.patients.find(p => p.id === patientId);
    if (!patient) return;
    if (patient.appointments && patient.appointments[index]) {
      patient.appointments[index].status = 'Confirmed';
    }
    this.selectedPatient = patient;
    // persist change and notify
    this.authService.persistPatients();
    this.toast.show('Appointment confirmed.', 'success');
  }

  private setupRealtimeListeners(): void {
    if (!this.currentUser) return;

    // Listen for new consultations where I am the doctor
    this.channel = this.supabaseService.client
      .channel('doctor_realtime_alerts')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'consultations',
        filter: `doctor_id=eq.${this.currentUser.id}` 
      }, (payload: any) => {
        const newConsult = payload.new;
        if (newConsult.status === 'confirmed' || newConsult.status === 'active') {
          this.addIncomingRequest(newConsult.type === 'emergency' ? 'emergency' : 'standard', {
            patientId: newConsult.patient_id,
            patientName: 'New Patient', // TODO: Fetch patient name if needed
            consultationType: newConsult.type,
            timestamp: newConsult.created_at,
            room_id: newConsult.room_id
          });
        }
      })
      .subscribe();
  }

  private cleanupRealtime(): void {
    if (this.channel) {
      this.supabaseService.client.removeChannel(this.channel);
      this.channel = null;
    }
  }

  toggleStatus(): void {
    this.availabilityService.toggleStatus(this.isOnline);
  }

  private addIncomingRequest(type: 'emergency'|'standard', data: any): void {
    const exists = this.incomingRequests.some(r => r.patientId === data.patientId && r.type === type);
    if (!exists) {
      this.incomingRequests.push({
        type,
        patientId: data.patientId,
        patientName: data.patientName || 'Patient',
        consultationType: data.consultationType || 'chat',
        timestamp: data.timestamp || new Date().toISOString(),
        room_id: data.room_id
      });
      this.toast.show(`INCOMING ${type.toUpperCase()} REQUEST`, type === 'emergency' ? 'warning' : 'info');
      
      setTimeout(() => {
        this.incomingRequests = this.incomingRequests.filter(r => r.patientId !== data.patientId || r.type !== type);
      }, 45000);
    }
  }

  async acceptRequest(req: any): Promise<void> {
    if (!this.currentUser) return;
    
    try {
      // Set status to active if it's not already
      await this.supabaseService.client
        .from('consultations')
        .update({ status: 'active', started_at: new Date().toISOString() })
        .eq('room_id', req.room_id);

      this.incomingRequests = this.incomingRequests.filter(r => r !== req);
      this.router.navigate(['/consult/room', req.room_id]); 
    } catch (e: any) {
      this.toast.show('Failed to connect: ' + e.message, 'error');
    }
  }

  rejectRequest(req: any): void {
    this.incomingRequests = this.incomingRequests.filter(r => r !== req);
  }

  getLatestAssessment(patientId: string): DoshaAssessmentRecord | null {
    return this.authService.getLatestDoshaAssessment(patientId) || null;
  }

  getAssessmentTrend(patientId: string): DoshaAssessmentRecord[] {
    return this.authService.getDoshaAssessmentTrend(patientId, 3);
  }

  getPatientDietPlan(patientId: string): DietPlanRecord | null {
    const existing = this.ayurvedaData.getDietPlanForPatient(patientId);
    if (existing) return existing;
    const latest = this.authService.getLatestDoshaAssessment(patientId);
    if (!latest) return null;
    return this.ayurvedaData.generateDietPlan(patientId, latest);
  }

  getPatientRoutinePlan(patientId: string): RoutinePlanRecord | null {
    const latest = this.authService.getLatestDoshaAssessment(patientId);
    if (!latest) return null;
    const patient = this.authService.getPatientData(patientId) as any;
    return this.ayurvedaData.getPersonalizedRoutine({
      assessment: latest,
      season: patient?.season,
      sleepSchedule: patient?.sleepSchedule === 'night' ? 'night' : 'day',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    });
  }

  getPatientTherapyRequests(patientId: string): TherapyBookingRequest[] {
    const doctor = this.authService.getCurrentUser();
    if (!doctor || doctor.role !== 'doctor') return [];
    const doctorId = doctor.id;
    return this.ayurvedaData
      .getTherapyBookingsForDoctor(doctorId)
      .filter((req) => req.patientId === patientId);
  }

  getTherapyName(therapyId: string): string {
    return this.ayurvedaData.getTherapyById(therapyId)?.name || therapyId;
  }

  reviewTherapyRequest(requestId: string, action: 'approved' | 'rejected' | 'pending'): void {
    const doctor = this.authService.getCurrentUser();
    if (!doctor || doctor.role !== 'doctor') return;
    const doctorId = doctor.id;
    const notes = (this.therapyReviewNotes[requestId] || '').trim();
    const result = this.ayurvedaData.reviewTherapyRequest(doctorId, requestId, action, notes);
    if (!result.success) {
      this.toast.show(result.error || 'Unable to review therapy request.', 'error');
      return;
    }
    this.toast.show(`Therapy request marked as ${action}.`, 'success');
  }

  private async loadConsultationSchedule(): Promise<void> {
    try {
      const snapshot = await this.consultationBookingService.getMyBookings();
      const today = new Date().toISOString().slice(0, 10);
      this.todaySchedule = snapshot.upcoming
        .filter((item: any) => item.scheduledTime.slice(0, 10) === today)
        .slice(0, 10);
      this.consultationHistory = snapshot.past.slice(0, 10);
    } catch {
      this.todaySchedule = [];
      this.consultationHistory = [];
    }
  }
}
