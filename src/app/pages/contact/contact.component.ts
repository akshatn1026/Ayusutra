import { Component } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { StorefrontService } from '../../services/storefront.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss']
})
export class ContactComponent {
  title = 'Contact Us';
  submitting = false;

  model = {
    fullName: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  };

  constructor(
    private auth: AuthService,
    private storefront: StorefrontService,
    private toast: ToastService
  ) {}

  async submit(): Promise<void> {
    if (this.submitting) return;
    const fullName = String(this.model.fullName || '').trim();
    const email = String(this.model.email || '').trim().toLowerCase();
    const phone = String(this.model.phone || '').trim();
    const subject = String(this.model.subject || '').trim();
    const message = String(this.model.message || '').trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ');

    if (!firstName || !email || !message) {
      this.toast.show('Please complete name, email, and message.', 'warning');
      return;
    }
    if (!this.isValidEmail(email)) {
      this.toast.show('Please enter a valid email address.', 'warning');
      return;
    }

    this.submitting = true;
    try {
      await this.storefront.saveContactSubmission({
        firstName,
        lastName,
        email,
        phone,
        subject,
        message,
        userId: this.auth.getCurrentUser()?.id
      });
      this.model = { fullName: '', email: '', phone: '', subject: '', message: '' };
      this.toast.show('Your message has been sent successfully.', 'success');
    } catch {
      this.toast.show('Unable to send message right now. Please retry in a moment.', 'error');
    } finally {
      this.submitting = false;
    }
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
