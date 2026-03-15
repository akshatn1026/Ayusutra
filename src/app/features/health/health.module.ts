import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { HealthRoutingModule } from './health-routing.module';
import { DoshaAssessmentComponent } from '../../pages/dosha-assessment/dosha-assessment.component';
import { DoshaReportComponent } from '../../pages/dosha-report/dosha-report.component';
import { AiAssistantComponent } from '../../pages/ai-assistant/ai-assistant.component';
import { DietPlanComponent } from '../../pages/diet-plan/diet-plan.component';
import { DailyRoutineComponent } from '../../pages/daily-routine/daily-routine.component';
import { MedicalReportAnalyzerComponent } from '../../pages/medical-report-analyzer/medical-report-analyzer.component';
import { PanchakarmaComponent } from '../../pages/panchakarma/panchakarma.component';
import { PanchakarmaBookComponent } from '../../pages/panchakarma-book/panchakarma-book.component';

@NgModule({
  declarations: [
    DoshaAssessmentComponent,
    DoshaReportComponent,
    AiAssistantComponent,
    DietPlanComponent,
    DailyRoutineComponent,
    MedicalReportAnalyzerComponent,
    PanchakarmaComponent,
    PanchakarmaBookComponent
  ],
  imports: [
    SharedModule,
    HealthRoutingModule
  ]
})
export class HealthModule {}
