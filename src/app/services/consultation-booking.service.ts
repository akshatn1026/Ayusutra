import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

export type BookingMode = 'chat' | 'audio' | 'video';

export interface BookingDoctor {
  id: string;
  name: string;
  specialization: string[];
  experienceYears: number;
  languages: string[];
  consultationModes: BookingMode[];
  nextAvailableSlot: string | null;
  relevanceScore: number;
}

export interface BookingSlot {
  startAt: string;
  endAt: string;
  durationMinutes: number;
  mode: BookingMode;
}

export interface ConsultationBooking {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName?: string;
  doctorSpecialization?: string;
  patientName?: string;
  mode: BookingMode;
  scheduledTime: string;
  duration: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  issueContext: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  cancelledBy?: string | null;
  cancelledReason?: string | null;
}

export interface DoctorContinuityItem {
  doctorId: string;
  doctorName: string;
  specialization: string;
  lastConsultedAt: string;
  nextScheduledAt: string | null;
  totalBooked: number;
  totalCompleted: number;
  recentIssues: string[];
}

export interface DoctorPatientBrief {
  patient: {
    id: string;
    name: string;
    phone: string;
    email: string;
    age: number | null;
    gender: string | null;
    location: string | null;
  };
  continuity: {
    totalConsultations: number;
    lastConsultationAt: string | null;
    recentIssues: string[];
    recentSymptoms: Array<{
      symptom: string;
      severity: 'Low' | 'Medium' | 'High';
      loggedForDate: string;
      note: string;
    }>;
    medicationSnapshot: string[];
    allergies: string[];
    lastDoctorNote: string;
  };
  dosha: any | null;
  history: Array<{
    id: string;
    mode: BookingMode;
    status: 'scheduled' | 'completed' | 'cancelled';
    scheduledTime: string;
    duration: number;
    issueContext: string;
    notes: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class ConsultationBookingService {
  private readonly API = '/api/consultation';

  constructor(private http: HttpClient) {}

  async getRecommendation(params: { issue?: string; urgency?: 'low' | 'medium' | 'high' } = {}): Promise<{
    mode: BookingMode;
    issueSuggestion: string;
    reasons: string[];
  }> {
    const query = new URLSearchParams();
    if (params.issue) query.set('issue', params.issue);
    if (params.urgency) query.set('urgency', params.urgency);
    return firstValueFrom(
      this.http.get<{ mode: BookingMode; issueSuggestion: string; reasons: string[] }>(
        `${this.API}/recommendation?${query.toString()}`
      )
    );
  }

  async getDoctors(mode: BookingMode, issueContext = ''): Promise<BookingDoctor[]> {
    const query = new URLSearchParams();
    query.set('mode', mode);
    if (issueContext.trim()) query.set('issue', issueContext.trim());
    const response = await firstValueFrom(
      this.http.get<{ doctors: BookingDoctor[] }>(`${this.API}/doctors?${query.toString()}`)
    );
    return response.doctors || [];
  }

  async getAvailability(doctorId: string, mode: BookingMode, days = 7): Promise<BookingSlot[]> {
    const query = new URLSearchParams();
    query.set('doctorId', doctorId);
    query.set('mode', mode);
    query.set('days', String(days));
    const response = await firstValueFrom(
      this.http.get<{ slots: BookingSlot[] }>(`${this.API}/availability?${query.toString()}`)
    );
    return response.slots || [];
  }

  async book(input: {
    mode: BookingMode;
    scheduledTime: string;
    duration: number;
    issueContext: string;
    autoAssign?: boolean;
    doctorId?: string;
  }): Promise<{ booking: ConsultationBooking; doctor: BookingDoctor }> {
    return firstValueFrom(
      this.http.post<{ booking: ConsultationBooking; doctor: BookingDoctor }>(`${this.API}/book`, input)
    );
  }

  async getMyBookings(): Promise<{ bookings: ConsultationBooking[]; upcoming: ConsultationBooking[]; past: ConsultationBooking[] }> {
    return firstValueFrom(
      this.http.get<{ bookings: ConsultationBooking[]; upcoming: ConsultationBooking[]; past: ConsultationBooking[] }>(
        `${this.API}/my-bookings`
      )
    );
  }

  async getContinuity(limit = 8): Promise<DoctorContinuityItem[]> {
    const query = new URLSearchParams();
    query.set('limit', String(Math.max(1, Math.min(20, limit))));
    const response = await firstValueFrom(
      this.http.get<{ continuity: DoctorContinuityItem[] }>(`${this.API}/continuity?${query.toString()}`)
    );
    return response.continuity || [];
  }

  async getDoctorPatientBrief(patientId: string, doctorId?: string): Promise<DoctorPatientBrief> {
    const query = new URLSearchParams();
    query.set('patientId', patientId);
    if (doctorId) query.set('doctorId', doctorId);
    return firstValueFrom(
      this.http.get<DoctorPatientBrief>(`${this.API}/patient-brief?${query.toString()}`)
    );
  }

  async cancelBooking(bookingId: string, reason = ''): Promise<void> {
    await firstValueFrom(
      this.http.patch(
        `${this.API}/bookings/${encodeURIComponent(bookingId)}/cancel`,
        { reason }
      )
    );
  }
}
