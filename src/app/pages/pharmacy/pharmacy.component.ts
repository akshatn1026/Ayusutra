import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AyurvedaDataService } from '../../services/ayurveda-data.service';
import { PrescriptionRecord } from '../../models/ayurveda.models';

@Component({
  selector: 'app-pharmacy',
  templateUrl: './pharmacy.component.html',
  styleUrls: ['./pharmacy.component.scss']
})
export class PharmacyComponent implements OnInit {
  prescriptions: PrescriptionRecord[] = [];
  selectedPrescriptionId = '';
  subscription: 'none' | 'monthly' | 'quarterly' = 'none';
  status = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private ayurvedaData: AyurvedaDataService
  ) {}

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    if (!user) {
      this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/pharmacy' } });
      return;
    }
    this.prescriptions = this.ayurvedaData.getPrescriptionsForPatient(user.id);
    if (this.prescriptions.length) this.selectedPrescriptionId = this.prescriptions[0].id;
  }

  placeOrder(): void {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    const rx = this.prescriptions.find((p) => p.id === this.selectedPrescriptionId);
    if (!rx) {
      this.status = 'Select a valid prescription.';
      return;
    }
    this.ayurvedaData.placeOrder({
      patientId: user.id,
      prescriptionId: rx.id,
      items: rx.items.map((i) => ({ name: i.medicine, qty: 1 })),
      subscription: this.subscription
    });
    this.ayurvedaData.createNotification(
      user.id,
      'medicine',
      'Pharmacy order placed',
      'Your prescription medicines order has been placed.',
      ['inApp', 'email']
    );
    this.status = 'Order placed successfully.';
  }
}
