import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AyurvedaDataService } from '../../services/ayurveda-data.service';

type TrustPanel = 'privacy' | 'credentials' | 'disclaimer';

@Component({
  selector: 'app-trust-transparency',
  templateUrl: './trust-transparency.component.html',
  styleUrls: ['./trust-transparency.component.scss']
})
export class TrustTransparencyComponent implements OnInit {
  totalDoctors = 0;
  verifiedDoctors = 0;
  activePanel: TrustPanel | null = null;
  todayLabel = '';

  constructor(
    private ayurvedaData: AyurvedaDataService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const doctors = this.ayurvedaData.getDoctors();
    this.totalDoctors = doctors.length;
    this.verifiedDoctors = doctors.filter((doctor) => doctor.verified).length;
    this.todayLabel = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  open(panel: TrustPanel): void {
    this.activePanel = panel;
  }

  close(): void {
    this.activePanel = null;
  }

  async openDoctorDirectory(): Promise<void> {
    this.close();
    await this.router.navigate(['/doctor-directory']);
  }
}
