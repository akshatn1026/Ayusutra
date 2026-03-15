import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
  @Output() registerSuccess = new EventEmitter<void>();

  registerForm!: FormGroup;
  errorMessage: string = '';
  isLoading: boolean = false;
  selectedRole: 'patient' | 'doctor' = 'patient';
  forcedRole: 'patient' | 'doctor' | null = null;
  showPassword: boolean = false;
  showConfirmPassword: boolean = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.initForm();
    const routeRole = this.route.snapshot.data['signupRole'] as 'patient' | 'doctor' | undefined;
    if (routeRole === 'patient' || routeRole === 'doctor') {
      this.forcedRole = routeRole;
      this.selectedRole = routeRole;
    }
  }

  private initForm(): void {
    this.registerForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
      medicalLicense: [''],
      specialization: [''],
      experience: [''],
      clinicName: [''],
      consultationFee: ['']
    }, { validators: this.passwordMatchValidator });
  }

  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');
    
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      return { passwordMismatch: true };
    }
    
    return null;
  }

  selectRole(role: 'patient' | 'doctor'): void {
    if (this.forcedRole) return;
    this.selectedRole = role;
    this.updateDoctorValidation();
  }

  private updateDoctorValidation(): void {
    const doctorControls = ['medicalLicense', 'specialization', 'experience', 'clinicName', 'consultationFee'];
    doctorControls.forEach(ctrlName => {
      const ctrl = this.registerForm.get(ctrlName);
      if (ctrl) {
        if (this.selectedRole === 'doctor') {
          ctrl.setValidators([Validators.required]);
        } else {
          ctrl.clearValidators();
          ctrl.setValue('');
        }
        ctrl.updateValueAndValidity();
      }
    });
  }

  async onSubmit(): Promise<void> {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.selectedRole = this.forcedRole || this.selectedRole;

    const userData = this.registerForm.value;
    const result = await this.authService.register({
      fullName: userData.fullName,
      email: userData.email,
      password: userData.password,
      confirmPassword: userData.confirmPassword,
      role: this.selectedRole,
      medicalLicense: userData.medicalLicense,
      specialization: userData.specialization,
      experience: userData.experience,
      clinicName: userData.clinicName,
      consultationFee: userData.consultationFee
    });

    if (result.success) {
      this.registerSuccess.emit();
      this.router.navigate(['/login'], { queryParams: { created: 'true', role: this.selectedRole } });
    } else {
      this.errorMessage = result.error || 'Registration failed.';
    }
    this.isLoading = false;
  }

  togglePassword(field: 'password' | 'confirmPassword'): void {
    if (field === 'password') {
      this.showPassword = !this.showPassword;
      return;
    }
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  get passwordStrengthScore(): number {
    const password = String(this.password?.value || '');
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    if (password.length >= 12) score += 1;
    return Math.min(score, 6);
  }

  get passwordStrengthLabel(): 'Weak' | 'Medium' | 'Strong' {
    const score = this.passwordStrengthScore;
    if (score <= 2) return 'Weak';
    if (score <= 4) return 'Medium';
    return 'Strong';
  }

  get canSubmit(): boolean {
    return !this.isLoading && !!this.registerForm && this.registerForm.valid;
  }

  get fullName() { return this.registerForm.get('fullName'); }
  get email() { return this.registerForm.get('email'); }
  get password() { return this.registerForm.get('password'); }
  get confirmPassword() { return this.registerForm.get('confirmPassword'); }
  get medicalLicense() { return this.registerForm.get('medicalLicense'); }
  get specialization() { return this.registerForm.get('specialization'); }
  get experience() { return this.registerForm.get('experience'); }
  get clinicName() { return this.registerForm.get('clinicName'); }
  get consultationFee() { return this.registerForm.get('consultationFee'); }
  get isDoctorSignup(): boolean { return this.forcedRole === 'doctor' || this.selectedRole === 'doctor'; }
}
