import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../../core/guards/auth.guard';
import { DoshaAssessmentComponent } from '../../pages/dosha-assessment/dosha-assessment.component';
import { DoshaReportComponent } from '../../pages/dosha-report/dosha-report.component';
import { AiAssistantComponent } from '../../pages/ai-assistant/ai-assistant.component';
import { DietPlanComponent } from '../../pages/diet-plan/diet-plan.component';
import { DailyRoutineComponent } from '../../pages/daily-routine/daily-routine.component';
import { MedicalReportAnalyzerComponent } from '../../pages/medical-report-analyzer/medical-report-analyzer.component';
import { PanchakarmaComponent } from '../../pages/panchakarma/panchakarma.component';
import { PanchakarmaBookComponent } from '../../pages/panchakarma-book/panchakarma-book.component';

const routes: Routes = [
  { path: 'dosha-assessment', component: DoshaAssessmentComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'dosha-report', component: DoshaReportComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'ai-assistant', component: AiAssistantComponent, canActivate: [AuthGuard] },
  { path: 'diet-plan', component: DietPlanComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'daily-routine', component: DailyRoutineComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'seasonal-routine', component: DailyRoutineComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'medical-report-analyzer', component: MedicalReportAnalyzerComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'therapies', component: PanchakarmaComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'therapies/:therapyId', component: PanchakarmaComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'therapies/request/:therapyId', component: PanchakarmaBookComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'panchakarma/book', component: PanchakarmaBookComponent, canActivate: [AuthGuard], data: { role: 'patient' } },
  { path: 'panchakarma', component: PanchakarmaComponent, canActivate: [AuthGuard], data: { role: 'patient' } }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class HealthRoutingModule {}
