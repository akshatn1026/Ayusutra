import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { SupabaseService } from '../services/supabase.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private supabaseService: SupabaseService) {
    console.log('🚀 AuthInterceptor Initialized');
  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!req.url.includes('/api/')) {
      return next.handle(req);
    }
    console.log('--- Interceptor: Processing Request ---', req.url);
    return from(this.supabaseService.client.auth.getSession()).pipe(
      switchMap((result) => {
        const session = result?.data?.session;
        console.log('Interceptor: URL', req.url, 'Has Session:', !!session);
        if (session?.access_token) {
          console.log('Interceptor: Attaching token');
          const authReq = req.clone({
            setHeaders: {
              Authorization: `Bearer ${session.access_token}`
            }
          });
          return next.handle(authReq);
        }
        return next.handle(req);
      })
    );
  }
}
