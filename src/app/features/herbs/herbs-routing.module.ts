import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../../core/guards/auth.guard';
import { HerbsComponent } from '../../pages/herbs/herbs.component';
import { HerbDetailComponent } from '../../pages/herb-detail/herb-detail.component';

const routes: Routes = [
  { path: '', component: HerbsComponent },
  { path: ':id', component: HerbDetailComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class HerbsRoutingModule {}
