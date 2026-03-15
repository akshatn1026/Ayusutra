import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, DoshaAssessmentRecord, DoshaType } from '../../services/auth.service';
import { AyurvedaDataService, DailyRoutineDigestRecord, LifestyleProfile, RoutinePlanRecord } from '../../services/ayurveda-data.service';
import { RoutineSuggestion } from '../../models/ayurveda.models';
import { LanguageService } from '../../services/language.service';
import { BookmarkService } from '../../services/bookmark.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-daily-routine',
  templateUrl: './daily-routine.component.html',
  styleUrls: ['./daily-routine.component.scss']
})
export class DailyRoutineComponent implements OnInit, OnDestroy {
  dosha: DoshaType = 'Vata';
  routine: RoutineSuggestion[] = [];
  plan: RoutinePlanRecord | null = null;
  digest: DailyRoutineDigestRecord | null = null;
  assessment: DoshaAssessmentRecord | null = null;
  loading = true;
  error = '';
  language: 'en' | 'hi' = 'en';
  showSimpleShloka = true;
  timezone = 'UTC';
  viewMode: 'daily' | 'seasonal' = 'daily';
  remindersEnabled = true;
  activeReminderIds = new Set<string>();
  reminderStatus = '';
  private langSub?: Subscription;

  constructor(
    private auth: AuthService,
    private ayurvedaData: AyurvedaDataService,
    private route: ActivatedRoute,
    private router: Router,
    private languageService: LanguageService,
    private bookmarks: BookmarkService
  ) {}

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    const returnUrl = this.router.url.includes('/seasonal-routine') ? '/seasonal-routine' : '/daily-routine';
    if (!user) {
      this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl } });
      return;
    }
    this.assessment = this.auth.getLatestDoshaAssessment(user.id) || null;
    if (!this.assessment) {
      this.loading = false;
      this.router.navigate(['/dosha-assessment'], {
        queryParams: {
          source: 'daily-routine'
        }
      });
      return;
    }

    this.viewMode = this.router.url.includes('/seasonal-routine') ? 'seasonal' : 'daily';
    this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const patientData = this.auth.getPatientData(user.id) as any;
    const season = this.resolveSeason(patientData);
    const location = String(patientData?.location || patientData?.profile?.location || '').trim();
    const sleepSchedule = patientData?.sleepSchedule === 'night' ? 'night' : 'day';
    const lifestyle = this.resolveLifestyle(patientData);

    this.plan = this.ayurvedaData.getPersonalizedRoutine({
      assessment: this.assessment,
      season,
      location,
      timezone: this.timezone,
      sleepSchedule
    });
    this.digest = this.ayurvedaData.getDailyRoutineDigest({
      patientId: user.id,
      assessment: this.assessment,
      season,
      location,
      timezone: this.timezone,
      sleepSchedule,
      lifestyle
    });
    this.dosha = this.plan.basis.pacifyDosha;
    this.routine = this.digest.items;

    this.remindersEnabled = this.readReminderEnabledFlag(user.id);
    this.language = this.languageService.currentLanguage;
    this.langSub = this.languageService.languageChanges.subscribe((lang) => this.language = lang);
    this.showSimpleShloka = this.languageService.isShlokaSimplified;
    this.loading = false;
  }

  ngOnDestroy(): void {
    if (this.langSub) this.langSub.unsubscribe();
  }

  addReminder(item: RoutineSuggestion): void {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    if (!this.remindersEnabled) {
      this.reminderStatus = this.language === 'hi'
        ? 'रिमाइंडर बंद हैं। सेटिंग चालू करके दोबारा कोशिश करें।'
        : 'Reminders are disabled. Enable reminders and try again.';
      return;
    }

    if (this.activeReminderIds.has(item.id)) {
      this.activeReminderIds.delete(item.id);
      this.reminderStatus = this.language === 'hi'
        ? `${item.title} रिमाइंडर हटाया गया।`
        : `${item.title} reminder removed.`;
      return;
    }

    this.ayurvedaData.createNotification(
      user.id,
      'routine',
      `Reminder set: ${item.title}`,
      `${item.reminderLabel || 'Routine'} at ${item.time} (${this.timezone}).`,
      ['inApp', 'email'],
      {
        contextKey: `routine:${item.id}:${item.time}`,
        valueScore: 88,
        force: true
      }
    );
    this.activeReminderIds.add(item.id);
    this.reminderStatus = this.language === 'hi'
      ? `${item.title} के लिए रिमाइंडर सेट हुआ।`
      : `${item.title} reminder set.`;
  }

  toggleReminderControls(): void {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    this.remindersEnabled = !this.remindersEnabled;
    localStorage.setItem(`ayusutra_routine_reminders_${user.id}`, this.remindersEnabled ? 'on' : 'off');
    this.reminderStatus = this.remindersEnabled
      ? (this.language === 'hi' ? 'रिमाइंडर चालू किए गए।' : 'Routine reminders enabled.')
      : (this.language === 'hi' ? 'रिमाइंडर बंद किए गए।' : 'Routine reminders disabled.');
  }

  get shlokaText(): string {
    if (this.showSimpleShloka) {
      return this.language === 'hi'
        ? 'दिनचर्या संतुलित हो तो दोष, अग्नि और नींद स्थिर रहते हैं।'
        : 'When daily routine is stable, dosha, agni, and sleep stay balanced.';
    }
    return 'ब्रह्मे मुहूर्त उत्तिष्ठेत् स्वस्थो रक्षार्थमायुषः।';
  }

  get pageTitle(): string {
    return this.viewMode === 'seasonal' ? 'Ritucharya Routine' : 'Dinacharya & Ritucharya';
  }

  get basisLine(): string {
    return this.digest?.summary || this.plan?.basis.line || '';
  }

  get planTips(): string[] {
    return (this.plan?.tips || []).slice(0, 2);
  }

  get timeBasedOverview(): string {
    if (!this.routine.length) return 'Routine timeline will appear after plan generation.';
    const first = this.routine[0];
    const last = this.routine[this.routine.length - 1];
    return `Your structured routine window is ${first.time} to ${last.time} (${this.timezone}).`;
  }

  get todayVsRecommended(): string {
    if (!this.routine.length) return 'No recommendation available yet.';
    const active = this.activeReminderIds.size;
    return `${active} of ${this.routine.length} daily routine reminders are active.`;
  }

  get gentleReminders(): string[] {
    return [
      'Start with one step now and follow the next step at its time.',
      'If you miss a step, continue from the next one without catching up all at once.',
      'Use reminders only for your top two steps to keep the routine calm.'
    ];
  }

  isReminderActive(item: RoutineSuggestion): boolean {
    return this.activeReminderIds.has(item.id);
  }

  toggleRoutineBookmark(item: RoutineSuggestion): void {
    const key = `${this.viewMode}:${item.id}`;
    this.bookmarks.toggle('routine_item', key);
  }

  isRoutineBookmarked(item: RoutineSuggestion): boolean {
    const key = `${this.viewMode}:${item.id}`;
    return this.bookmarks.isBookmarked('routine_item', key);
  }

  private resolveSeason(patientData: any): 'vasanta' | 'grishma' | 'varsha' | 'sharada' | 'hemanta' | 'shishira' {
    const querySeason = this.route.snapshot.queryParamMap.get('season');
    const candidate = querySeason || patientData?.preferredSeason || patientData?.season;
    if (
      candidate === 'vasanta' ||
      candidate === 'grishma' ||
      candidate === 'varsha' ||
      candidate === 'sharada' ||
      candidate === 'hemanta' ||
      candidate === 'shishira'
    ) return candidate;

    const location = String(patientData?.location || patientData?.profile?.location || '').trim();
    return this.ayurvedaData.resolveSeasonForContext(location);
  }

  private readReminderEnabledFlag(userId: string): boolean {
    return localStorage.getItem(`ayusutra_routine_reminders_${userId}`) !== 'off';
  }

  private resolveLifestyle(patientData: any): LifestyleProfile {
    const activityRaw = String(patientData?.activityLevel || patientData?.profile?.activityLevel || '').toLowerCase();
    const workRaw = String(patientData?.workRhythm || patientData?.profile?.workRhythm || '').toLowerCase();
    const stressRaw = String(patientData?.stressLevel || patientData?.profile?.stressLevel || '').toLowerCase();

    const activityLevel: LifestyleProfile['activityLevel'] =
      activityRaw === 'low' || activityRaw === 'high' ? (activityRaw as any) : 'moderate';
    const workRhythm: LifestyleProfile['workRhythm'] =
      workRaw === 'mixed' || workRaw === 'active' ? (workRaw as any) : 'desk';
    const stressLevel: LifestyleProfile['stressLevel'] =
      stressRaw === 'low' || stressRaw === 'high' ? (stressRaw as any) : 'moderate';

    return { activityLevel, workRhythm, stressLevel };
  }
}
