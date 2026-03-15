import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../../core/guards/auth.guard';
import { UserDashboardComponent } from '../../pages/dashboards/user-dashboard/user-dashboard.component';
import { DoctorDashboardComponent } from '../../pages/dashboards/doctor-dashboard/doctor-dashboard.component';
import { ProfileComponent } from '../../pages/profile/profile.component';
import { NotificationsComponent } from '../../pages/notifications/notifications.component';

const routes: Routes = [
  { path: '', component: UserDashboardComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'doctor', component: DoctorDashboardComponent, canActivate: [AuthGuard], data: { role: 'doctor' } },
  { path: 'profile', component: ProfileComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'notifications', component: NotificationsComponent, canActivate: [AuthGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DashboardRoutingModule {}
