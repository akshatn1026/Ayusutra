import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },

  { path: 'user-dashboard', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'patient/dashboard', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'doctor-dashboard', redirectTo: 'dashboard/doctor', pathMatch: 'full' },
  { path: 'doctor/dashboard', redirectTo: 'dashboard/doctor', pathMatch: 'full' },
  { path: 'shop', redirectTo: 'home', pathMatch: 'full' },
  { path: 'discounts', redirectTo: 'home', pathMatch: 'full' },

  {
    path: 'dashboard',
    loadChildren: () => import('./features/dashboard/dashboard.module').then(m => m.DashboardModule)
  },
  {
    path: 'consult',
    loadChildren: () => import('./features/consultation/consultation.module').then(m => m.ConsultationModule)
  },
  {
    path: 'herbs',
    loadChildren: () => import('./features/herbs/herbs.module').then(m => m.HerbsModule)
  },
  {
    path: 'pharmacy',
    loadChildren: () => import('./features/pharmacy/pharmacy.module').then(m => m.PharmacyModule)
  },

  {
    path: '',
    loadChildren: () => import('./features/auth/auth.module').then(m => m.AuthModule)
  },
  {
    path: '',
    loadChildren: () => import('./features/health/health.module').then(m => m.HealthModule)
  },
  {
    path: '',
    loadChildren: () => import('./features/content/content.module').then(m => m.ContentModule)
  },

  { path: '**', redirectTo: 'home' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    scrollPositionRestoration: 'enabled',
    anchorScrolling: 'enabled'
  })],
  exports: [RouterModule]
})
export class AppRoutingModule {}
