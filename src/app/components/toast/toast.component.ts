import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { Toast, ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss']
})
export class ToastComponent implements OnInit, OnDestroy {
  toasts: Toast[] = [];
  sub!: Subscription;

  constructor(private toastService: ToastService) {}

  ngOnInit(): void {
    this.sub = this.toastService.toasts$.subscribe(t => this.toasts = t);
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  dismiss(id: string) {
    this.toastService.dismiss(id);
  }

  runAction(t: Toast) {
    if (t.action) {
      try {
        t.action();
      } catch {
        // ignore
      }
    }
    this.dismiss(t.id);
  }
}
