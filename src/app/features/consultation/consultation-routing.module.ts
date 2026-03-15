import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../../core/guards/auth.guard';
import { ConsultComponent } from '../../pages/consult/consult.component';
import { ConsultRoomComponent } from '../../pages/consult-room/consult-room.component';
import { PrescriptionComponent } from '../../pages/prescription/prescription.component';
import { DoctorDirectoryComponent } from '../../pages/doctor-directory/doctor-directory.component';

const routes: Routes = [
  { path: '', component: ConsultComponent, canActivate: [AuthGuard] },
  { path: 'session/:sessionId', component: ConsultRoomComponent, canActivate: [AuthGuard] },
  { path: 'doctor/:doctorId', component: ConsultRoomComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'doctors', component: DoctorDirectoryComponent, canActivate: [AuthGuard] },
  { path: 'prescription/create/:sessionId', component: PrescriptionComponent, canActivate: [AuthGuard], data: { role: 'doctor' } },
  { path: 'prescription/:consultationId', component: PrescriptionComponent, canActivate: [AuthGuard], data: { role: 'doctor' } },
  { path: 'patient/prescription/:prescriptionId', component: PrescriptionComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'patient/prescriptions', component: PrescriptionComponent, canActivate: [AuthGuard], data: { role: 'patient' } }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ConsultationRoutingModule {}
