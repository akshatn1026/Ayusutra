import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss']
})
export class ForgotPasswordComponent implements OnInit {
  forgotForm!: FormGroup;
  errorMessage: string = '';
  successMessage: string = '';
  isLoading: boolean = false;
  selectedRole: 'patient' | 'doctor' = 'patient';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  private initForm(): void {
    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  async onSubmit(role?: 'patient' | 'doctor'): Promise<void> {
    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.selectedRole = role || this.selectedRole;

    const { email } = this.forgotForm.value;
    const result = await this.authService.forgotPassword(email, this.selectedRole);
    if (result.success) {
      this.successMessage = 'If an account exists, an OTP has been sent.';
      setTimeout(() => {
        this.router.navigate(['/reset-password'], {
          queryParams: {
            identifier: String(email || '').trim(),
            role: this.selectedRole
          }
        });
      }, 700);
    } else {
      this.errorMessage = result.error || 'Unable to process request.';
    }
    this.isLoading = false;
  }

  navigateToLogin(): void {
    this.router.navigate(['/login']);
  }

  get email() {
    return this.forgotForm.get('email');
  }
}
