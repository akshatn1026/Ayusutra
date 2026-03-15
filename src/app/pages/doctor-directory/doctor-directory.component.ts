import { Component, OnInit } from '@angular/core';
import { AyurvedaDataService } from '../../services/ayurveda-data.service';
import { Router } from '@angular/router';
import { DoctorProfile } from '../../models/ayurveda.models';
import { BookingDoctor, ConsultationBookingService } from '../../services/consultation-booking.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-doctor-directory',
  templateUrl: './doctor-directory.component.html',
  styleUrls: ['./doctor-directory.component.scss']
})
export class DoctorDirectoryComponent implements OnInit {
  doctors: DoctorProfile[] = [];
  filtered: DoctorProfile[] = [];
  query = '';
  loading = false;
  error = '';

  constructor(
    private ayurvedaData: AyurvedaDataService,
    private bookingService: ConsultationBookingService,
    private auth: AuthService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.error = '';
    this.doctors = await this.loadRealDoctors();
    this.filtered = [...this.doctors];
    this.loading = false;
  }

  search(): void {
    const q = this.query.trim().toLowerCase();
    if (!q) { this.filtered = [...this.doctors]; return; }
    this.filtered = this.doctors.filter((d) =>
      d.fullName.toLowerCase().includes(q) ||
      (d.email || '').toLowerCase().includes(q) ||
      (d.specialization || []).some((item) => item.toLowerCase().includes(q))
    );
  }

  async viewDoctor(doc: DoctorProfile): Promise<void> {
    await this.router.navigate(['/consult', doc.id]);
  }

  get isPatient(): boolean {
    return this.auth.getCurrentUser()?.role === 'patient';
  }

  private async loadRealDoctors(): Promise<DoctorProfile[]> {
    try {
      const [chat, audio, video] = await Promise.all([
        this.bookingService.getDoctors('chat', ''),
        this.bookingService.getDoctors('audio', ''),
        this.bookingService.getDoctors('video', '')
      ]);
      const merged = [...chat, ...audio, ...video];
      const map = new Map<string, BookingDoctor>();
      for (const row of merged) {
        if (!row?.id) continue;
        const existing = map.get(row.id);
        if (!existing) {
          map.set(row.id, row);
          continue;
        }
        map.set(row.id, {
          ...existing,
          consultationModes: Array.from(new Set([...(existing.consultationModes || []), ...(row.consultationModes || [])])),
          languages: Array.from(new Set([...(existing.languages || []), ...(row.languages || [])])),
          specialization: Array.from(new Set([...(existing.specialization || []), ...(row.specialization || [])])),
          nextAvailableSlot: existing.nextAvailableSlot || row.nextAvailableSlot,
          relevanceScore: Math.max(Number(existing.relevanceScore || 0), Number(row.relevanceScore || 0)),
          experienceYears: Math.max(Number(existing.experienceYears || 0), Number(row.experienceYears || 0))
        });
      }
      const asProfiles = Array.from(map.values())
        .map((d) => ({
          id: d.id,
          fullName: d.name,
          phone: '',
          email: '',
          role: 'doctor' as const,
          verified: true,
          degree: 'BAMS',
          specialization: d.specialization || ['General Ayurveda'],
          experienceYears: Number(d.experienceYears || 1),
          rating: 4.8,
          reviewsCount: 0,
          bio: 'Verified Ayustura doctor profile.'
        }))
        .sort((a, b) => Number(b.experienceYears || 0) - Number(a.experienceYears || 0));
      if (asProfiles.length) return asProfiles;
      return this.ayurvedaData.getDoctors();
    } catch {
      this.error = 'Live doctor directory is temporarily unavailable. Showing synced directory.';
      return this.ayurvedaData.getDoctors();
    }
  }
}
