import { Component, OnInit } from '@angular/core';
import { AuthService, DoshaAssessmentRecord, PatientData, User } from '../../services/auth.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  user: User | null = null;
  patientData: PatientData | null = null;
  latestDoshaAssessment: DoshaAssessmentRecord | null = null;
  editMode = false;

  model = {
    fullName: '',
    phone: '',
    email: '',
    wellnessMessage: ''
  };

  constructor(private auth: AuthService) {}

  ngOnInit(): void {
    this.user = this.auth.getCurrentUser();
    if (this.user && this.user.role === 'patient') {
      const pd = this.auth.getPatientData(this.user.id);
      if (pd) this.patientData = pd;
      this.latestDoshaAssessment = this.auth.getLatestDoshaAssessment(this.user.id) || null;
    }

    if (this.user) {
      this.model.fullName = this.user.fullName;
      this.model.phone = this.user.phone;
      this.model.email = this.user.email || '';
    }

    if (this.patientData) {
      this.model.wellnessMessage = this.patientData.wellnessMessage || '';
    }
  }

  save(): void {
    if (!this.user) return;
    this.auth.updateCurrentUser({ fullName: this.model.fullName, phone: this.model.phone, email: this.model.email });
    if (this.patientData) {
      const updated: PatientData = { ...this.patientData, name: this.model.fullName, wellnessMessage: this.model.wellnessMessage };
      this.auth.updatePatientData(updated);
      this.patientData = updated;
    }
    this.editMode = false;
  }

  get avatarUrl(): string {
    const source = String(this.patientData?.avatarUrl || '').trim();
    if (source) return source;
    const name = String(this.user?.fullName || 'Ayustura User').trim();
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'AU';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#a8c72d"/><text x="50" y="56" font-size="34" text-anchor="middle" fill="#ffffff" font-family="Manrope, Arial">${initials}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

}
