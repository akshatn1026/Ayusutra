import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, NavigationError, Route, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService, User } from './services/auth.service';
import { RealtimeUserStateService } from './services/realtime-user-state.service';
import { StorefrontService } from './services/storefront.service';
import { SmartCareReminderService } from './services/smart-care-reminder.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  compactMode = false;
  cartCount = 0;
  showUserMenu = false;
  navItems: Array<{ label: string; path: string; action?: () => void }> = [];
  authItems: Array<{ label: string; path: string }> = [];
  hasCartRoute = false;
  hasProfileRoute = false;
  hasLogoutRoute = false;
  hasConsultCta = false;

  private authSub?: Subscription;
  private navErrSub?: Subscription;
  private navEndSub?: Subscription;
  private readonly DENSITY_KEY_BASE = 'ayusutra_density_mode';

  constructor(
    public authService: AuthService,
    private router: Router,
    private realtimeUserState: RealtimeUserStateService,
    private storefront: StorefrontService,
    private smartCareReminder: SmartCareReminderService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.applyCompactPreference();
    this.refreshCartCount();

    this.authSub = this.authService.currentUser$.subscribe((user) => {
      this.currentUser = user;
      this.applyCompactPreference();
      this.buildNavbar();
      this.refreshCartCount();
      void this.smartCareReminder.runForCurrentUser();
    });

    this.navErrSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationError))
      .subscribe(() => {
        const fallback = this.currentUser ? '/home' : '/login';
        void this.router.navigate([fallback]);
      });

    this.navEndSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.showUserMenu = false;
        this.buildNavbar();
        this.refreshCartCount();
        void this.smartCareReminder.runForCurrentUser();
      });

    this.buildNavbar();
    void this.smartCareReminder.runForCurrentUser();
  }

  ngOnDestroy(): void {
    if (this.authSub) this.authSub.unsubscribe();
    if (this.navErrSub) this.navErrSub.unsubscribe();
    if (this.navEndSub) this.navEndSub.unsubscribe();
  }

  get isAuthenticated(): boolean {
    return !!this.currentUser;
  }

  get dashboardRoute(): string {
    if (!this.currentUser) return '/dashboard';
    return this.currentUser.role === 'doctor' ? '/doctor/dashboard' : '/dashboard';
  }

  goHome(): void {
    void this.router.navigate(['/home']);
  }

  goShop(): void {
    void this.router.navigate(['/home'], { fragment: 'products' });
  }

  goBlog(): void {
    void this.router.navigate(['/blog']);
  }

  goDiscounts(): void {
    void this.router.navigate(['/home'], { queryParams: { discount: 1 }, fragment: 'products' });
  }

  goAbout(): void {
    void this.router.navigate(['/about']);
  }

  goBuyNow(): void {
    if (!this.currentUser) {
      void this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/consult' } });
      return;
    }
    void this.router.navigate(['/consult']);
  }

  goConsultNow(): void {
    this.goBuyNow();
  }

  openProfileOrDashboard(): void {
    if (!this.currentUser) {
      void this.router.navigate(['/login']);
      return;
    }
    void this.router.navigate([this.currentUser.role === 'doctor' ? '/doctor/dashboard' : '/dashboard']);
  }

  goCart(): void {
    if (!this.hasCartRoute) return;
    if (!this.currentUser) {
      void this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/cart' } });
      return;
    }
    void this.router.navigate(['/cart']);
  }

  toggleUserMenu(): void {
    this.showUserMenu = !this.showUserMenu;
  }

  closeUserMenu(): void {
    this.showUserMenu = false;
  }

  toggleDensityMode(): void {
    this.compactMode = !this.compactMode;
    localStorage.setItem(this.densityKey(), this.compactMode ? 'compact' : 'comfortable');
    this.applyDensityMode();
  }

  private applyCompactPreference(): void {
    this.compactMode = localStorage.getItem(this.densityKey()) === 'compact';
    this.applyDensityMode();
  }

  private applyDensityMode(): void {
    document.body.classList.toggle('compact-density', this.compactMode);
  }

  private densityKey(): string {
    const userId = this.currentUser?.id || 'guest';
    return `${this.DENSITY_KEY_BASE}_${userId}`;
  }

  private refreshCartCount(): void {
    if (!this.currentUser || this.currentUser.role !== 'patient') {
      this.cartCount = 0;
      return;
    }
    this.cartCount = this.storefront.cartCount(this.currentUser.id);
  }

  private buildNavbar(): void {
    const loggedIn = !!this.currentUser;
    const role = this.currentUser?.role || null;

    const dashboardPath = role === 'doctor' ? '/doctor/dashboard' : '/dashboard';
    const candidatePrimary: Array<{ label: string; path: string; loggedInOnly?: boolean }> = [
      { label: 'HOME', path: '/home' },
      { label: 'DASHBOARD', path: dashboardPath, loggedInOnly: true },
      { label: 'CONSULTATION', path: '/consult', loggedInOnly: true },
      { label: 'AI ASSISTANT', path: '/ai-assistant', loggedInOnly: true },
      { label: 'REPORT ANALYZER', path: '/medical-report-analyzer', loggedInOnly: true }
    ];

    this.navItems = candidatePrimary
      .filter((item) => this.routeIsNavigable(item.path, role))
      .filter((item) => (item.loggedInOnly ? loggedIn : true))
      .map((item) => ({ label: item.label, path: item.path }));

    this.authItems = [];
    if (!loggedIn) {
      if (this.routeIsNavigable('/login', null)) this.authItems.push({ label: 'LOGIN', path: '/login' });
      if (this.routeIsNavigable('/register', null)) this.authItems.push({ label: 'SIGNUP', path: '/register' });
    }

    this.hasCartRoute = this.routeIsNavigable('/cart', role);
    this.hasProfileRoute = this.routeIsNavigable('/profile', role);
    this.hasLogoutRoute = this.routeIsNavigable('/logout', role);
    this.hasConsultCta = this.routeExists('/consult');
  }

  private routeIsNavigable(path: string, role: 'patient' | 'doctor' | null): boolean {
    const cleanPath = path.replace(/^\//, '');
    const route = this.findRouteByPath(cleanPath, this.router.config);
    if (!route || route.redirectTo) return false;

    const routeRole = String(route.data?.['role'] || '').trim();
    if (routeRole && role && routeRole !== role) return false;
    if (routeRole && !role) return false;

    if (route.canActivate && route.canActivate.length > 0 && !role) {
      return false;
    }

    return true;
  }

  private findRouteByPath(path: string, routes: Route[]): Route | null {
    for (const route of routes) {
      if (route.path === path) return route;
      if (route.children && route.children.length > 0) {
        const nested = this.findRouteByPath(path, route.children);
        if (nested) return nested;
      }
    }
    return null;
  }

  private routeExists(path: string): boolean {
    const cleanPath = path.replace(/^\//, '');
    const route = this.findRouteByPath(cleanPath, this.router.config);
    return !!route && !route.redirectTo;
  }
}
