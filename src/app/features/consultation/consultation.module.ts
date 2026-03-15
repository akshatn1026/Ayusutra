import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { ConsultationRoutingModule } from './consultation-routing.module';
import { ConsultComponent } from '../../pages/consult/consult.component';
import { ConsultRoomComponent } from '../../pages/consult-room/consult-room.component';
import { PrescriptionComponent } from '../../pages/prescription/prescription.component';
import { DoctorDirectoryComponent } from '../../pages/doctor-directory/doctor-directory.component';

@NgModule({
  declarations: [
    ConsultComponent,
    ConsultRoomComponent,
    PrescriptionComponent,
    DoctorDirectoryComponent
  ],
  imports: [
    SharedModule,
    ConsultationRoutingModule
  ]
})
export class ConsultationModule {}
