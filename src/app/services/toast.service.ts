import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface Toast {
  id: string;
  message: string;
  type?: 'success' | 'info' | 'warning' | 'error';
  duration?: number;
  actionLabel?: string;
  action?: () => void;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private toastsSubject = new Subject<Toast[]>();
  toasts$ = this.toastsSubject.asObservable();
  private toasts: Toast[] = [];

  show(message: string, type: Toast['type'] = 'info', duration = 4000, actionLabel?: string, action?: () => void) {
    const id = Math.random().toString(36).slice(2, 9);
    const t: Toast = { id, message, type, duration, actionLabel, action };
    this.toasts.push(t);
    this.toastsSubject.next(this.toasts);
    if (duration && duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.toastsSubject.next(this.toasts);
  }

  clear() {
    this.toasts = [];
    this.toastsSubject.next(this.toasts);
  }
}
