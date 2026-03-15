import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../../core/guards/auth.guard';
import { PharmacyComponent } from '../../pages/pharmacy/pharmacy.component';
import { CartComponent } from '../../pages/cart/cart.component';
import { OrdersComponent } from '../../pages/orders/orders.component';

const routes: Routes = [
  { path: '', component: PharmacyComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'cart', component: CartComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'checkout', component: PharmacyComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'orders', component: OrdersComponent, canActivate: [AuthGuard], data: { role: 'patient' } }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PharmacyRoutingModule {}
