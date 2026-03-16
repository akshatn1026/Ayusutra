import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { SupabaseService } from '../services/supabase.service';
import { buildApiUrl } from '../config/runtime-config';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private supabaseService: SupabaseService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const normalizedReq = req.url.startsWith('/api/')
      ? req.clone({ url: buildApiUrl(req.url) })
      : req;

    if (!normalizedReq.url.includes('/api/')) {
      return next.handle(normalizedReq);
    }

    if (normalizedReq.headers.has('Authorization')) {
      return next.handle(normalizedReq);
    }

    return from(this.supabaseService.client.auth.getSession()).pipe(
      switchMap((result) => {
        const session = result?.data?.session;
        if (session?.access_token) {
          const authReq = normalizedReq.clone({
            setHeaders: {
              Authorization: `Bearer ${session.access_token}`
            }
          });
          return next.handle(authReq);
        }
        return next.handle(normalizedReq);
      })
    );
  }
}
