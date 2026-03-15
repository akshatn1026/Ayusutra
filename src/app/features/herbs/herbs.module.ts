import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { HerbsRoutingModule } from './herbs-routing.module';
import { HerbsComponent } from '../../pages/herbs/herbs.component';
import { HerbDetailComponent } from '../../pages/herb-detail/herb-detail.component';

@NgModule({
  declarations: [
    HerbsComponent,
    HerbDetailComponent
  ],
  imports: [
    SharedModule,
    HerbsRoutingModule
  ]
})
export class HerbsModule {}
