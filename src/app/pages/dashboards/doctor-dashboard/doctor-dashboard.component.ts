import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService, DoshaAssessmentRecord, PatientData, User } from '../../../services/auth.service';
import { AyurvedaDataService, RoutinePlanRecord } from '../../../services/ayurveda-data.service';
import { DietPlanRecord, TherapyBookingRequest } from '../../../models/ayurveda.models';
import { ToastService } from '../../../services/toast.service';
import { ConsultationBooking, ConsultationBookingService } from '../../../services/consultation-booking.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Router } from '@angular/router';

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

  incomingRequests: { type: 'emergency'|'standard', patientId: string, patientName: string, consultationType?: string, timestamp: string }[] = [];
  private channel: any = null;
  private refreshTimer: any;
  currentUser: User | null = null;
  isOnline = true;

  constructor(
    private authService: AuthService,
    private ayurvedaData: AyurvedaDataService,
    private toast: ToastService,
    private consultationBookingService: ConsultationBookingService,
    private router: Router,
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit(): Promise<void> {
    this.currentUser = this.authService.getCurrentUser();
    try {
      await this.loadDashboard();
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
    // This method can be used to refresh data without showing loading indicators
    await this.loadDashboard();
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
    this.channel = this.supabaseService.client
      .channel('doctor_alerts')
      .on('broadcast', { event: 'emergency-request' }, (payload: any) => {
        this.addIncomingRequest('emergency', payload.payload);
      })
      .on('broadcast', { event: 'consult-request' }, (payload: any) => {
        this.addIncomingRequest('standard', payload.payload);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.isOnline = true;
        }
      });
  }

  private cleanupRealtime(): void {
    if (this.channel) {
      this.supabaseService.client.removeChannel(this.channel);
      this.channel = null;
    }
  }

  toggleStatus(): void {
    if (!this.currentUser) return;
    
    if (this.isOnline) {
      if (!this.channel) this.setupRealtimeListeners();
      this.toast.show('You are now Online and available for consultations.', 'success');
    } else {
      this.cleanupRealtime();
      this.toast.show('You are now Offline.', 'info');
    }
  }

  private addIncomingRequest(type: 'emergency'|'standard', data: any): void {
    const exists = this.incomingRequests.some(r => r.patientId === data.patientId && r.type === type);
    if (!exists) {
      this.incomingRequests.push({
        type,
        patientId: data.patientId,
        patientName: data.patientName || 'Patient',
        consultationType: data.consultationType || 'chat',
        timestamp: data.timestamp || new Date().toISOString()
      });
      this.toast.show(`INCOMING ${type.toUpperCase()} REQUEST`, type === 'emergency' ? 'warning' : 'info');
      
      setTimeout(() => {
        this.incomingRequests = this.incomingRequests.filter(r => r.patientId !== data.patientId || r.type !== type);
      }, 45000);
    }
  }

  async acceptRequest(req: any): Promise<void> {
    if (!this.currentUser) return;
    const patientId = req.patientId;
    
    try {
      const response = await fetch('http://localhost:4000/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patientId,
          doctorId: this.currentUser.id,
          requesterId: this.currentUser.id,
          requesterRole: 'doctor',
          initiationType: 'instant'
        })
      });
      const sessionData = await response.json();
      if (!response.ok) throw new Error(sessionData.error || 'Failed to create session');
      
      const sessionId = sessionData.sessionId;

      const eventName = req.type === 'emergency' ? 'emergency-accept' : 'consult-accept';
      if (this.channel) {
        this.channel.send({
          type: 'broadcast',
          event: eventName,
          payload: {
            patientId,
            doctorName: this.currentUser.fullName || 'Doctor',
            sessionId: sessionId
          }
        });
      }

      const localConsult = this.ayurvedaData.startConsultation({
        patientId: patientId,
        doctorId: this.currentUser.id,
        initiationType: 'instant'
      });
      
      if (localConsult && sessionId) {
         localConsult.sessionId = sessionId;
         localConsult.id = sessionId; 
         (this.ayurvedaData as any).persistConsultations();
      }

      this.incomingRequests = this.incomingRequests.filter(r => r !== req);
      this.router.navigate(['/consult/session', sessionId]); 
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
        .filter((item) => item.scheduledTime.slice(0, 10) === today)
        .slice(0, 10);
      this.consultationHistory = snapshot.past.slice(0, 10);
    } catch {
      this.todaySchedule = [];
      this.consultationHistory = [];
    }
  }
}
