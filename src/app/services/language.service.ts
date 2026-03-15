import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AppLanguage = 'en' | 'hi';

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private readonly KEY = 'ayusutra_lang';
  private readonly SHLOKA_KEY = 'ayusutra_shloka_mode';
  private lang$ = new BehaviorSubject<AppLanguage>('en');
  private shlokaSimple$ = new BehaviorSubject<boolean>(true);

  constructor() {
    const saved = localStorage.getItem(this.KEY) as AppLanguage | null;
    const shloka = localStorage.getItem(this.SHLOKA_KEY);
    if (saved === 'en' || saved === 'hi') this.lang$.next(saved);
    if (shloka === 'true' || shloka === 'false') this.shlokaSimple$.next(shloka === 'true');
  }

  get languageChanges() {
    return this.lang$.asObservable();
  }

  get shlokaModeChanges() {
    return this.shlokaSimple$.asObservable();
  }

  get currentLanguage(): AppLanguage {
    return this.lang$.value;
  }

  get isShlokaSimplified(): boolean {
    return this.shlokaSimple$.value;
  }

  toggleLanguage(): void {
    const next: AppLanguage = this.lang$.value === 'en' ? 'hi' : 'en';
    this.lang$.next(next);
    localStorage.setItem(this.KEY, next);
  }

  toggleShlokaMode(): void {
    const next = !this.shlokaSimple$.value;
    this.shlokaSimple$.next(next);
    localStorage.setItem(this.SHLOKA_KEY, String(next));
  }
}
