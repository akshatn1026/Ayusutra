import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ModalComponent } from '../components/modal/modal.component';
import { ToastComponent } from '../components/toast/toast.component';
import { TrustTransparencyComponent } from '../components/trust-transparency/trust-transparency.component';
import { TranslateSubtreeDirective } from '../directives/translate-subtree.directive';

@NgModule({
  declarations: [
    ModalComponent,
    ToastComponent,
    TrustTransparencyComponent,
    TranslateSubtreeDirective
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule
  ],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    ModalComponent,
    ToastComponent,
    TrustTransparencyComponent,
    TranslateSubtreeDirective
  ]
})
export class SharedModule {}
