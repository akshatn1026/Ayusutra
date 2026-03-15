import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { AyurvedaDataService } from '../../services/ayurveda-data.service';
import { PharmacyOrder } from '../../models/ayurveda.models';

@Component({
  selector: 'app-orders',
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.scss']
})
export class OrdersComponent implements OnInit {
  orders: PharmacyOrder[] = [];

  constructor(private auth: AuthService, private ayurvedaData: AyurvedaDataService) {}

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    this.orders = this.ayurvedaData.getOrdersForPatient(user.id);
  }
}
