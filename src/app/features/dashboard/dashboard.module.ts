import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { DashboardRoutingModule } from './dashboard-routing.module';
import { UserDashboardComponent } from '../../pages/dashboards/user-dashboard/user-dashboard.component';
import { DoctorDashboardComponent } from '../../pages/dashboards/doctor-dashboard/doctor-dashboard.component';
import { ProfileComponent } from '../../pages/profile/profile.component';
import { NotificationsComponent } from '../../pages/notifications/notifications.component';

@NgModule({
  declarations: [
    UserDashboardComponent,
    DoctorDashboardComponent,
    ProfileComponent,
    NotificationsComponent
  ],
  imports: [
    SharedModule,
    DashboardRoutingModule
  ]
})
export class DashboardModule {}
