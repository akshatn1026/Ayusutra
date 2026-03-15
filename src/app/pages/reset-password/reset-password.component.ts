import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss']
})
export class ResetPasswordComponent implements OnInit {
  resetForm!: FormGroup;
  errorMessage: string = '';
  successMessage: string = '';
  isLoading: boolean = false;
  identifier: string = '';
  role: 'patient' | 'doctor' = 'patient';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Get email from query params
    this.route.queryParams.subscribe(params => {
      this.identifier = String(params['identifier'] || params['email'] || '').trim();
      this.role = params['role'] === 'doctor' ? 'doctor' : 'patient';
      if (!this.identifier) {
        this.router.navigate(['/forgot-password']);
        return;
      }
    });
    
    this.initForm();
  }

  private initForm(): void {
    this.resetForm = this.fb.group({
      otp: ['', [Validators.required, Validators.pattern(/^[0-9]{6}$/)]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword');
    const confirmPassword = control.get('confirmPassword');

    if (newPassword && confirmPassword && newPassword.value !== confirmPassword.value) {
      return { passwordMismatch: true };
    }
    return null;
  }

  async onSubmit(): Promise<void> {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const { otp, newPassword } = this.resetForm.value;
    const result = await this.authService.resetPasswordWithOtp(this.identifier, otp, newPassword);
    if (result.success) {
      this.successMessage = 'Password reset successfully! Redirecting to login...';
      setTimeout(() => {
        this.router.navigate(['/login'], { queryParams: { reset: 'true' } });
      }, 1200);
    } else {
      this.errorMessage = result.error || 'Failed to reset password. Please try again.';
      this.isLoading = false;
    }
  }

  navigateToLogin(): void {
    this.router.navigate(['/login']);
  }

  get otp() { return this.resetForm.get('otp'); }
  get newPassword() { return this.resetForm.get('newPassword'); }
  get confirmPassword() { return this.resetForm.get('confirmPassword'); }
}
