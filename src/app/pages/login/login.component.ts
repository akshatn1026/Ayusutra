import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  @Output() loginSuccess = new EventEmitter<void>();
  
  loginForm!: FormGroup;
  errorMessage: string = '';
  infoMessage: string = '';
  isLoading: boolean = false;
  redirected: boolean = false;
  returnUrl: string | null = null;
  selectedRole: 'patient' | 'doctor' = 'patient';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
    , private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.route.queryParams.subscribe(params => {
      if (params['redirected']) {
        this.redirected = params['redirected'] === 'true';
      }
      if (params['returnUrl']) {
        this.returnUrl = params['returnUrl'];
      }
      if (params['role'] === 'doctor' || params['role'] === 'patient') {
        this.selectedRole = params['role'];
      }
      if (params['accessDenied'] === 'true') {
        this.errorMessage = 'Access denied. Please login with the correct account role.';
      }
      if (params['verified'] === 'true') {
        this.infoMessage = 'Email verified successfully. Please login.';
      }
      if (params['created'] === 'true') {
        this.infoMessage = 'Account created successfully. Please login.';
      }
    });
  }

  private initForm(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  async onSubmit(role?: 'patient' | 'doctor'): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.selectedRole = role || this.selectedRole;

    const { email, password } = this.loginForm.value;
    const result = await this.authService.login(email, password);
    if (result.success) {
      this.loginSuccess.emit();
      const backendRole = result.user?.role;
      if (backendRole === 'doctor') {
        this.router.navigate(['/home']);
      } else {
        this.router.navigate(['/dashboard']);
      }
    } else {
      this.errorMessage = result.error || 'Invalid credentials. Please try again.';
    }
    this.isLoading = false;
  }

  get email() {
    return this.loginForm.get('email');
  }

  get password() {
    return this.loginForm.get('password');
  }
}
