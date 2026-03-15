import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../../core/guards/auth.guard';
import { HomeComponent } from '../../pages/home/home.component';
import { AboutComponent } from '../../pages/about/about.component';
import { ServicesComponent } from '../../pages/services/services.component';
import { ContactComponent } from '../../pages/contact/contact.component';
import { FeaturesComponent } from '../../pages/features/features.component';
import { BlogListComponent } from '../../pages/blog-list/blog-list.component';
import { BlogDetailComponent } from '../../pages/blog-detail/blog-detail.component';

const routes: Routes = [
  { path: 'home', component: HomeComponent },
  { path: 'about', component: AboutComponent },
  { path: 'services', component: ServicesComponent },
  { path: 'contact', component: ContactComponent },
  { path: 'features', component: FeaturesComponent },
  { path: 'blog', component: BlogListComponent },
  { path: 'blog/:id', component: BlogDetailComponent },
  // Legacy top-level redirects to new module locations
  { path: 'profile', redirectTo: '/dashboard/profile', pathMatch: 'full' },
  { path: 'notifications', redirectTo: '/dashboard/notifications', pathMatch: 'full' },
  { path: 'cart', redirectTo: '/pharmacy/cart', pathMatch: 'full' },
  { path: 'checkout', redirectTo: '/pharmacy/checkout', pathMatch: 'full' },
  { path: 'orders', redirectTo: '/pharmacy/orders', pathMatch: 'full' },
  { path: 'doctors', redirectTo: '/consult/doctors', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ContentRoutingModule {}
