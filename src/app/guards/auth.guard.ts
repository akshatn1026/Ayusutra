import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ):
    | Observable<boolean | UrlTree>
    | Promise<boolean | UrlTree>
    | boolean
    | UrlTree {
    return this.checkAuth(route, state);
  }

  private async checkAuth(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<boolean | UrlTree> {
    const isAuth = await this.authService.ensureSession();
    let expectedRole = route.data && (route.data['role'] as string | undefined);
    if (!expectedRole && state.url.startsWith('/patient/')) expectedRole = 'patient';
    if (!expectedRole && state.url.startsWith('/doctor/')) expectedRole = 'doctor';

    if (!isAuth) {
      return this.router.createUrlTree(['/login'], { queryParams: { redirected: 'true', returnUrl: state.url } });
    }

    if (expectedRole) {
      const user = this.authService.getCurrentUser();
      if (!user || user.role !== expectedRole) {
        this.authService.clearSessionOnly();
        return this.router.createUrlTree(['/login'], { queryParams: { accessDenied: 'true', role: expectedRole } });
      }
    }

    return true;
  }
}
