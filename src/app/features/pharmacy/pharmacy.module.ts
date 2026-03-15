import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { PharmacyRoutingModule } from './pharmacy-routing.module';
import { PharmacyComponent } from '../../pages/pharmacy/pharmacy.component';
import { CartComponent } from '../../pages/cart/cart.component';
import { OrdersComponent } from '../../pages/orders/orders.component';

@NgModule({
  declarations: [
    PharmacyComponent,
    CartComponent,
    OrdersComponent
  ],
  imports: [
    SharedModule,
    PharmacyRoutingModule
  ]
})
export class PharmacyModule {}
