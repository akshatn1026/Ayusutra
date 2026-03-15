import { Injectable } from '@angular/core';
import { AuthService, DoshaAssessmentRecord, User } from './auth.service';
import { AyurvedaDataService } from './ayurveda-data.service';
import { ConsultationBooking, ConsultationBookingService } from './consultation-booking.service';
import { PrescriptionRecord } from '../models/ayurveda.models';

interface ReminderCandidate {
  key: string;
  type: 'medicine' | 'appointment' | 'general';
  title: string;
  message: string;
  channels: Array<'inApp' | 'email' | 'sms'>;
  priority: number;
}

@Injectable({ providedIn: 'root' })
export class SmartCareReminderService {
  private readonly LAST_RUN_PREFIX = 'ayustra_smart_reminder_last_run_';
  private readonly SENT_MAP_PREFIX = 'ayustra_smart_reminder_sent_map_';
  private readonly RUN_COOLDOWN_MS = 6 * 60 * 60 * 1000;
  private readonly SEND_COOLDOWN_MS = 20 * 60 * 60 * 1000;
  private readonly MAX_NOTIFICATIONS_PER_RUN = 2;

  constructor(
    private auth: AuthService,
    private ayurvedaData: AyurvedaDataService,
    private consultationBookingService: ConsultationBookingService
  ) {}

  async runForCurrentUser(force = false): Promise<void> {
    const user = this.auth.getCurrentUser();
    if (!user || user.role !== 'patient') return;
    if (!force && !this.canRunNow(user.id)) return;
    this.markRun(user.id);

    const bookingSnapshot = await this.loadBookingsSafe();
    const candidates = this.buildCandidates(user, bookingSnapshot);
    if (!candidates.length) return;

    const sentMap = this.getSentMap(user.id);
    const now = Date.now();
    const selected = candidates
      .sort((a, b) => b.priority - a.priority)
      .filter((item) => {
        const lastSent = Number(sentMap[item.key] || 0);
        return !lastSent || now - lastSent > this.SEND_COOLDOWN_MS;
      })
      .slice(0, this.MAX_NOTIFICATIONS_PER_RUN);

    if (!selected.length) return;
    for (const item of selected) {
      this.ayurvedaData.createNotification(
        user.id,
        item.type,
        item.title,
        item.message,
        item.channels,
        { contextKey: `smart:${item.key}`, valueScore: item.priority }
      );
      sentMap[item.key] = String(now);
    }
    this.saveSentMap(user.id, sentMap);
  }

  private buildCandidates(
    user: User,
    bookingSnapshot: { upcoming: ConsultationBooking[]; past: ConsultationBooking[] } | null
  ): ReminderCandidate[] {
    const prescriptions = this.ayurvedaData.getPrescriptionsForPatient(user.id);
    const orders = this.ayurvedaData.getOrdersForPatient(user.id);
    const latestDosha = this.auth.getLatestDoshaAssessment(user.id) || null;

    const candidates: ReminderCandidate[] = [];
    const refillCandidate = this.pickRefillCandidate(prescriptions, orders);
    if (refillCandidate) candidates.push(refillCandidate);

    const followUpCandidate = this.pickFollowUpCandidate(bookingSnapshot, prescriptions);
    if (followUpCandidate) candidates.push(followUpCandidate);

    const reassessCandidate = this.pickReassessmentCandidate(latestDosha, bookingSnapshot, prescriptions);
    if (reassessCandidate) candidates.push(reassessCandidate);

    return candidates;
  }

  private pickRefillCandidate(
    prescriptions: PrescriptionRecord[],
    orders: Array<{ prescriptionId?: string; createdAt: string; subscription: string }>
  ): ReminderCandidate | null {
    if (!prescriptions.length) return null;
    const now = Date.now();
    const active = prescriptions.filter((p) => (p.status || 'active') === 'active');

    for (const rx of active) {
      const estimatedDays = this.estimatePrescriptionDays(rx);
      const startMs = new Date(rx.createdAt).getTime();
      if (!Number.isFinite(startMs)) continue;
      const endMs = startMs + estimatedDays * 24 * 60 * 60 * 1000;
      const daysLeft = Math.ceil((endMs - now) / (24 * 60 * 60 * 1000));
      const lastOrder = orders
        .filter((o) => String(o.prescriptionId || '') === String(rx.id || ''))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

      const hasSubscription = !!lastOrder && lastOrder.subscription && lastOrder.subscription !== 'none';
      if (hasSubscription) continue;

      const hasRecentOrder = !!lastOrder && new Date(lastOrder.createdAt).getTime() > startMs;
      if (hasRecentOrder && daysLeft > 0) continue;
      if (daysLeft > 5 || daysLeft < -3) continue;

      const dayText = daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'already due';
      return {
        key: `refill_${rx.id}_${new Date(endMs).toISOString().slice(0, 10)}`,
        type: 'medicine',
        title: 'Medicine refill reminder',
        message: `Your prescription ${rx.prescriptionId || rx.id} is ${dayText}. Refill now to avoid interruption.`,
        channels: ['inApp'],
        priority: 95
      };
    }

    return null;
  }

  private pickFollowUpCandidate(
    bookingSnapshot: { upcoming: ConsultationBooking[]; past: ConsultationBooking[] } | null,
    prescriptions: PrescriptionRecord[]
  ): ReminderCandidate | null {
    if (!bookingSnapshot) return null;
    const now = Date.now();
    const upcoming = bookingSnapshot.upcoming.filter((item) => item.status === 'scheduled');
    if (upcoming.length) return null;

    const completed = bookingSnapshot.past
      .filter((item) => item.status === 'completed')
      .sort((a, b) => b.scheduledTime.localeCompare(a.scheduledTime));
    const latestCompleted = completed[0];
    if (!latestCompleted) return null;

    const daysSince = Math.floor((now - new Date(latestCompleted.scheduledTime).getTime()) / (24 * 60 * 60 * 1000));
    if (!Number.isFinite(daysSince) || daysSince < 14) return null;

    const activeRx = prescriptions.some((p) => (p.status || 'active') === 'active');
    return {
      key: `followup_${latestCompleted.id}_${Math.floor(daysSince / 7)}`,
      type: 'appointment',
      title: 'Follow-up consultation suggested',
      message: activeRx
        ? `It has been ${daysSince} days since your last consultation. A follow-up can help adjust ongoing medication safely.`
        : `It has been ${daysSince} days since your last consultation with ${latestCompleted.doctorName || 'your doctor'}. Consider a follow-up review.`,
      channels: ['inApp'],
      priority: 80
    };
  }

  private pickReassessmentCandidate(
    latestDosha: DoshaAssessmentRecord | null,
    bookingSnapshot: { upcoming: ConsultationBooking[]; past: ConsultationBooking[] } | null,
    prescriptions: PrescriptionRecord[]
  ): ReminderCandidate | null {
    if (!latestDosha) {
      if (!prescriptions.length && !(bookingSnapshot?.past.length || 0)) return null;
      return {
        key: 'dosha_initial_prompt',
        type: 'general',
        title: 'Complete your dosha assessment',
        message: 'A dosha assessment improves refill timing, follow-up suggestions, and personalized care guidance.',
        channels: ['inApp'],
        priority: 70
      };
    }

    const now = Date.now();
    const ageDays = Math.floor((now - new Date(latestDosha.submittedAt).getTime()) / (24 * 60 * 60 * 1000));
    const hasRecentCompletedConsult = !!(bookingSnapshot?.past || []).find(
      (b) => b.status === 'completed' && new Date(b.scheduledTime).getTime() > new Date(latestDosha.submittedAt).getTime()
    );
    const severity = String(latestDosha.vikriti?.severity || 'Balanced');
    const due =
      ageDays >= 90 ||
      (hasRecentCompletedConsult && ageDays >= 30) ||
      (severity === 'High' && ageDays >= 21);
    if (!due) return null;

    return {
      key: `dosha_reassess_${Math.floor(ageDays / 30)}_${severity}`,
      type: 'general',
      title: 'Reassessment recommended',
      message:
        severity === 'High'
          ? 'Your last dosha report showed high imbalance. Reassessment can refine your next care steps.'
          : `Your dosha assessment is ${ageDays} days old. Reassessing now will improve care recommendations.`,
      channels: ['inApp'],
      priority: severity === 'High' ? 90 : 75
    };
  }

  private estimatePrescriptionDays(rx: PrescriptionRecord): number {
    const values = (rx.items || []).map((item) => this.parseDurationDays(item.duration));
    const valid = values.filter((d) => d > 0);
    if (!valid.length) return 30;
    return Math.max(...valid);
  }

  private parseDurationDays(raw: string | undefined): number {
    const value = String(raw || '').toLowerCase().trim();
    if (!value) return 0;
    const num = Number((value.match(/(\d+)/) || [])[1] || 0);
    if (!num) return 0;
    if (value.includes('week')) return num * 7;
    if (value.includes('month')) return num * 30;
    return num;
  }

  private async loadBookingsSafe(): Promise<{ upcoming: ConsultationBooking[]; past: ConsultationBooking[] } | null> {
    try {
      const snapshot = await this.consultationBookingService.getMyBookings();
      return { upcoming: snapshot.upcoming || [], past: snapshot.past || [] };
    } catch {
      return null;
    }
  }

  private canRunNow(userId: string): boolean {
    const last = Number(localStorage.getItem(`${this.LAST_RUN_PREFIX}${userId}`) || 0);
    if (!last) return true;
    return Date.now() - last > this.RUN_COOLDOWN_MS;
  }

  private markRun(userId: string): void {
    localStorage.setItem(`${this.LAST_RUN_PREFIX}${userId}`, String(Date.now()));
  }

  private getSentMap(userId: string): Record<string, string> {
    const raw = localStorage.getItem(`${this.SENT_MAP_PREFIX}${userId}`);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private saveSentMap(userId: string, map: Record<string, string>): void {
    localStorage.setItem(`${this.SENT_MAP_PREFIX}${userId}`, JSON.stringify(map || {}));
  }
}
