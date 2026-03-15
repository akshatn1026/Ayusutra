import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { ContentRoutingModule } from './content-routing.module';
import { HomeComponent } from '../../pages/home/home.component';
import { AboutComponent } from '../../pages/about/about.component';
import { ServicesComponent } from '../../pages/services/services.component';
import { ContactComponent } from '../../pages/contact/contact.component';
import { FeaturesComponent } from '../../pages/features/features.component';
import { BlogListComponent } from '../../pages/blog-list/blog-list.component';
import { BlogDetailComponent } from '../../pages/blog-detail/blog-detail.component';

@NgModule({
  declarations: [
    HomeComponent,
    AboutComponent,
    ServicesComponent,
    ContactComponent,
    FeaturesComponent,
    BlogListComponent,
    BlogDetailComponent
  ],
  imports: [
    SharedModule,
    ContentRoutingModule
  ]
})
export class ContentModule {}
