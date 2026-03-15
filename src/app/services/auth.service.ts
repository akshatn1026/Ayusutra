import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../core/services/supabase.service';
import { User as SupabaseUser } from '@supabase/supabase-js';

export interface User {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  role: 'patient' | 'doctor';
}

export interface YogaPose {
  name: string;
  duration: string;
  difficulty: string;
  image: string;
}

export interface Herb {
  name: string;
  benefit: string;
  image: string;
  hover: boolean;
}

export interface Appointment {
  doctor: string;
  date: string;
  time: string;
  status: string;
}

export interface MedicalHistory {
  condition: string;
  diagnosisDate: string;
  treatment: string;
  status: string;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  prescribedBy: string;
}

export interface RecoveryMilestone {
  date: string;
  milestone: string;
  progress: number;
}

export type DoshaType = 'Vata' | 'Pitta' | 'Kapha';
export type SymptomSeverity = 'Low' | 'Medium' | 'High';
export type ImbalanceSeverity = 'Low' | 'Moderate' | 'High' | 'Balanced';

export interface DoshaSymptomInput {
  key: string;
  label: string;
  dosha: DoshaType;
  severity?: SymptomSeverity;
}

export interface DoshaScores {
  vata: number;
  pitta: number;
  kapha: number;
}

export interface DoshaAssessmentRecord {
  id: string;
  userId: string;
  source: 'self_assessed';
  assessmentDate: string;
  validTill: string;
  selfReported: boolean;
  answers: Record<string, DoshaType>;
  scores: DoshaScores; // backward-compat mirror of prakriti.scores
  prakriti: {
    primary: DoshaType;
    secondary?: DoshaType;
    isDual: boolean;
    scores: DoshaScores;
    percentages: DoshaScores;
  };
  vikriti: {
    dominant: DoshaType | 'Balanced';
    severity: ImbalanceSeverity;
    symptomScores: DoshaScores;
    symptoms: DoshaSymptomInput[];
    imbalanceFlag: boolean;
  };
  // backward-compatible fields used in existing pages/services
  prakritiLabel?: DoshaType;
  vikritiLabel?: DoshaType | 'Balanced';
  primaryDosha: DoshaType;
  secondaryDosha?: DoshaType;
  result: string;
  submittedAt: string;
  confidence?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface DoshaAssessmentDraft {
  patientId: string;
  currentStep: number;
  stage: 'intro' | 'prakriti' | 'vikriti';
  answers: Record<string, DoshaType>;
  selectedSymptoms: DoshaSymptomInput[];
  noSymptoms: boolean;
  submitToken: string;
  updatedAt: string;
}

export interface SaveDoshaAssessmentResult {
  success: boolean;
  record?: DoshaAssessmentRecord;
  error?: string;
}

export interface PatientData {
  id: string;
  name: string;
  wellnessMessage: string;
  avatarUrl: string;
  overviewCards: any[];
  yogaPoses: YogaPose[];
  herbs: Herb[];
  appointments: Appointment[];
  medicalHistory: MedicalHistory[];
  currentMedications: Medication[];
  recoveryProgress: number;
  recoveryMilestones: RecoveryMilestone[];
  doshaAssessments?: DoshaAssessmentRecord[];
  doshaAssessmentDraft?: DoshaAssessmentDraft;
  age?: number;
  gender?: string;
  location?: string;
  allergies?: string[];
  healthData?: { allergies?: string[] };
  profile?: { age?: number; gender?: string; location?: string };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$: Observable<User | null> = this.currentUserSubject.asObservable();
  
  private readonly AUTH_API_BASE = '/api/auth';
  private readonly USER_KEY = 'ayustra_user';
  private readonly PATIENTS_KEY = 'ayustra_patients';
  private readonly DOSHA_SUBMIT_TOKENS_KEY = 'ayustra_dosha_submit_tokens';
  private readonly doctorsDirectory: User[] = [];
  private patientsData: PatientData[] = [];
  private sessionRestorePromise: Promise<boolean> | null = null;

  constructor(
    private router: Router,
    private http: HttpClient,
    private supabaseService: SupabaseService
  ) {
    this.loadPatientsData();
    this.loadAuthState();
  }

  // expose persistence for external callers (persist current in-memory patientsData)
  persistPatients(): void {
    this.savePatientsData();
  }

  private loadAuthState(): void {
    // We rely on supabaseService's internal onAuthStateChange, 
    // but we can still seed from local storage for faster initial load of enriched profile if available.
    const userData = localStorage.getItem(this.USER_KEY);
    if (userData) {
      try {
        const parsed = JSON.parse(userData) as User;
        this.currentUserSubject.next(parsed);
        this.ensureUserProfileExists(parsed);
      } catch {
        // noop
      }
    }
    this.sessionRestorePromise = this.restoreSessionFromToken();
  }

  isAuthenticated(): boolean {
    return !!this.currentUserSubject.value;
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  async ensureSession(): Promise<boolean> {
    if (this.isAuthenticated()) return true;
    if (!this.sessionRestorePromise) {
      this.sessionRestorePromise = this.restoreSessionFromToken();
    }
    const result = await this.sessionRestorePromise;
    if (!result) this.sessionRestorePromise = null;
    return result;
  }

  private setSession(user: User): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  private clearSessionState(): void {
    localStorage.removeItem(this.USER_KEY);
    this.currentUserSubject.next(null);
  }

  clearSessionOnly(): void {
    this.clearSessionState();
  }

  reloadPatientsFromStorage(): void {
    this.loadPatientsData();
    const current = this.getCurrentUser();
    if (current) this.ensureUserProfileExists(current);
  }

  private mapAuthUser(input: { id: string; name: string; phone?: string; email?: string; role: 'patient' | 'doctor' }): User {
    return {
      id: input.id,
      fullName: input.name,
      phone: input.phone || '',
      email: input.email || '',
      role: input.role || 'patient'
    };
  }

  private authHeaders(): HttpHeaders {
    // Interceptor will handle the Authorization header
    return new HttpHeaders();
  }

  private async restoreSessionFromToken(): Promise<boolean> {
    try {
      const result = await this.supabaseService.client.auth.getSession();
      const session = result?.data?.session;
      const error = result?.error;

      if (error || !session) {
        this.clearSessionState();
        return false;
      }
      
      // Sync with backend to get extra fields (name, role, etc.)
      const response = await firstValueFrom(
        this.http.get<{ user: { id: string; name: string; phone?: string; email?: string; role: 'patient' | 'doctor' } }>(
          `${this.AUTH_API_BASE}/me`
        )
      );
      const user = this.mapAuthUser(response.user);
      this.setSession(user);
      this.ensureUserProfileExists(user);
      return true;
    } catch {
      this.clearSessionState();
      return false;
    }
  }

  getPatientData(id: string): PatientData | undefined {
    return this.patientsData.find(p => p.id === id);
  }

  private createDefaultPatientData(user: User): PatientData {
    return {
      id: user.id,
      name: user.fullName,
      wellnessMessage: 'Your personalized wellness journey is active.',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
      overviewCards: [
        { title: 'Upcoming Yoga Sessions', value: '0', icon: '🧘', hover: false },
        { title: 'Saved Yoga Poses', value: '0', icon: '📚', hover: false },
        { title: 'Recommended Herbs', value: '0', icon: '🌿', hover: false },
        { title: 'Wellness Score', value: '0%', icon: '⭐', hover: false }
      ],
      yogaPoses: [],
      herbs: [],
      appointments: [],
      medicalHistory: [],
      currentMedications: [],
      recoveryProgress: 0,
      recoveryMilestones: []
    };
  }

  private ensureUserProfileExists(user: User): void {
    if (user.role === 'patient') {
      const idx = this.patientsData.findIndex((p) => p.id === user.id);
      if (idx === -1) {
        this.patientsData.push(this.createDefaultPatientData(user));
      } else if (!this.patientsData[idx].name) {
        this.patientsData[idx].name = user.fullName;
      }
      this.savePatientsData();
      return;
    }

    const doctorIdx = this.doctorsDirectory.findIndex((d) => d.id === user.id);
    if (doctorIdx === -1) {
      this.doctorsDirectory.push({
        id: user.id,
        fullName: user.fullName,
        phone: user.phone || '',
        email: user.email,
        role: 'doctor'
      });
    } else {
      this.doctorsDirectory[doctorIdx] = { ...this.doctorsDirectory[doctorIdx], ...user };
    }
  }

  private calculateDoshaScores(answers: Record<string, DoshaType>): DoshaScores {
    const scores: DoshaScores = { vata: 0, pitta: 0, kapha: 0 };
    Object.values(answers).forEach((dosha) => {
      if (dosha === 'Vata') scores.vata += 1;
      if (dosha === 'Pitta') scores.pitta += 1;
      if (dosha === 'Kapha') scores.kapha += 1;
    });
    return scores;
  }

  private determinePrakriti(scores: DoshaScores): {
    primaryDosha: DoshaType;
    secondaryDosha?: DoshaType;
    isDual: boolean;
    percentages: DoshaScores;
  } {
    const total = Math.max(scores.vata + scores.pitta + scores.kapha, 1);
    const ordered = [
      { dosha: 'Vata' as DoshaType, score: scores.vata },
      { dosha: 'Pitta' as DoshaType, score: scores.pitta },
      { dosha: 'Kapha' as DoshaType, score: scores.kapha }
    ].sort((a, b) => b.score - a.score);

    const primaryDosha = ordered[0].dosha;
    const secondaryDosha = ordered[1].score > 0 ? ordered[1].dosha : undefined;
    const isDual = !!secondaryDosha && ordered[0].score === ordered[1].score;
    const percentages: DoshaScores = {
      vata: Math.round((scores.vata / total) * 100),
      pitta: Math.round((scores.pitta / total) * 100),
      kapha: Math.round((scores.kapha / total) * 100)
    };

    return { primaryDosha, secondaryDosha, isDual, percentages };
  }

  private calculateVikriti(
    symptoms: DoshaSymptomInput[],
    primaryDosha: DoshaType
  ): DoshaAssessmentRecord['vikriti'] {
    const weightBySeverity: Record<SymptomSeverity, number> = { Low: 1, Medium: 2, High: 3 };
    const symptomScores: DoshaScores = { vata: 0, pitta: 0, kapha: 0 };

    symptoms.forEach((symptom) => {
      const w = symptom.severity ? weightBySeverity[symptom.severity] : 1;
      if (symptom.dosha === 'Vata') symptomScores.vata += w;
      if (symptom.dosha === 'Pitta') symptomScores.pitta += w;
      if (symptom.dosha === 'Kapha') symptomScores.kapha += w;
    });

    const totalSymptoms = symptomScores.vata + symptomScores.pitta + symptomScores.kapha;
    if (totalSymptoms === 0) {
      return {
        dominant: 'Balanced',
        severity: 'Balanced',
        symptomScores,
        symptoms: [],
        imbalanceFlag: false
      };
    }

    const ordered = [
      { dosha: 'Vata' as DoshaType, score: symptomScores.vata },
      { dosha: 'Pitta' as DoshaType, score: symptomScores.pitta },
      { dosha: 'Kapha' as DoshaType, score: symptomScores.kapha }
    ].sort((a, b) => b.score - a.score);
    const dominant = ordered[0].dosha;
    let severity: ImbalanceSeverity = 'Low';
    if (totalSymptoms >= 7) severity = 'High';
    else if (totalSymptoms >= 4) severity = 'Moderate';
    const imbalanceFlag = dominant !== primaryDosha;
    if (!imbalanceFlag && severity === 'High') severity = 'Moderate';

    return {
      dominant,
      severity,
      symptomScores,
      symptoms: [...symptoms],
      imbalanceFlag
    };
  }

  hasValidDoshaAssessment(patientId: string): { hasValid: boolean; latest?: DoshaAssessmentRecord } {
    const latest = this.getLatestDoshaAssessment(patientId);
    if (!latest) return { hasValid: false };
    const validTill = new Date(latest.validTill || latest.submittedAt).getTime();
    return { hasValid: validTill >= Date.now(), latest };
  }

  canReassess(patientId: string, doctorApproved = false): { allowed: boolean; reason?: string; latest?: DoshaAssessmentRecord } {
    const valid = this.hasValidDoshaAssessment(patientId);
    if (!valid.hasValid) return { allowed: true };
    if (doctorApproved) return { allowed: true, latest: valid.latest };
    return {
      allowed: false,
      reason: 'Your current assessment is still valid for 30 days. Reassessment requires doctor approval.',
      latest: valid.latest
    };
  }

  saveDoshaDraft(patientId: string, draft: Omit<DoshaAssessmentDraft, 'patientId' | 'updatedAt'>): boolean {
    const patient = this.patientsData.find(p => p.id === patientId);
    if (!patient) return false;
    patient.doshaAssessmentDraft = {
      patientId,
      updatedAt: new Date().toISOString(),
      ...draft
    };
    return this.savePatientsData();
  }

  getDoshaDraft(patientId: string): DoshaAssessmentDraft | undefined {
    return this.patientsData.find((p) => p.id === patientId)?.doshaAssessmentDraft;
  }

  clearDoshaDraft(patientId: string): boolean {
    const patient = this.patientsData.find(p => p.id === patientId);
    if (!patient) return false;
    delete patient.doshaAssessmentDraft;
    return this.savePatientsData();
  }

  saveDoshaAssessmentAtomic(input: {
    patientId: string;
    answers: Record<string, DoshaType>;
    symptoms: DoshaSymptomInput[];
    noSymptoms: boolean;
    submitToken: string;
    doctorApproved?: boolean;
  }): SaveDoshaAssessmentResult {
    const patient = this.patientsData.find(p => p.id === input.patientId);
    if (!patient) return { success: false, error: 'Patient profile not found.' };
    if (!input.submitToken.trim()) return { success: false, error: 'Unable to submit assessment. Please refresh and try again.' };

    const answerCount = Object.keys(input.answers).length;
    if (answerCount === 0) {
      return { success: false, error: 'Please complete all constitution questions before submitting.' };
    }
    if (!input.noSymptoms && input.symptoms.length === 0) {
      return { success: false, error: 'Select at least one recent symptom or confirm that you have no recent symptoms.' };
    }
    if (input.noSymptoms && input.symptoms.length > 0) {
      return { success: false, error: 'Please either select symptoms or choose no symptoms.' };
    }

    const reassess = this.canReassess(input.patientId, !!input.doctorApproved);
    if (!reassess.allowed) {
      return { success: false, error: reassess.reason };
    }

    const tokenMap = this.getSubmitTokenMap();
    const existingRecordId = tokenMap[input.submitToken];
    if (existingRecordId) {
      const existing = this.findAssessmentById(input.patientId, existingRecordId);
      if (existing) return { success: true, record: existing };
    }

    const scores = this.calculateDoshaScores(input.answers);
    const prakriti = this.determinePrakriti(scores);
    const vikriti = this.calculateVikriti(input.noSymptoms ? [] : input.symptoms, prakriti.primaryDosha);
    const assessmentDate = new Date().toISOString();
    const validTill = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = prakriti.secondaryDosha ? `${prakriti.primaryDosha}-${prakriti.secondaryDosha}` : prakriti.primaryDosha;

    const record: DoshaAssessmentRecord = {
      id: `dosha_${Date.now()}`,
      userId: input.patientId,
      source: 'self_assessed',
      assessmentDate,
      validTill,
      selfReported: true,
      answers: { ...input.answers },
      scores,
      prakriti: {
        primary: prakriti.primaryDosha,
        secondary: prakriti.secondaryDosha,
        isDual: prakriti.isDual,
        scores,
        percentages: prakriti.percentages
      },
      vikriti,
      prakritiLabel: prakriti.primaryDosha,
      vikritiLabel: vikriti.dominant,
      primaryDosha: prakriti.primaryDosha,
      secondaryDosha: prakriti.secondaryDosha,
      result,
      submittedAt: assessmentDate
    };

    const previous = patient.doshaAssessments ? [...patient.doshaAssessments] : [];
    if (!patient.doshaAssessments) patient.doshaAssessments = [];
    patient.doshaAssessments.push(record);

    if (!this.savePatientsData()) {
      patient.doshaAssessments = previous;
      return { success: false, error: 'Could not save your assessment right now. Please try again in a moment.' };
    }

    tokenMap[input.submitToken] = record.id;
    this.saveSubmitTokenMap(tokenMap);
    this.clearDoshaDraft(input.patientId);
    return { success: true, record };
  }

  // backward-compatible entry point
  saveDoshaAssessment(patientId: string, answers: Record<string, DoshaType>): DoshaAssessmentRecord | null {
    const fallbackToken = `legacy_${patientId}_${Date.now()}`;
    const result = this.saveDoshaAssessmentAtomic({
      patientId,
      answers,
      symptoms: [],
      noSymptoms: true,
      submitToken: fallbackToken
    });
    return result.record || null;
  }

  getLatestDoshaAssessment(patientId: string): DoshaAssessmentRecord | undefined {
    const patient = this.patientsData.find(p => p.id === patientId);
    if (!patient || !patient.doshaAssessments || patient.doshaAssessments.length === 0) return undefined;
    return [...patient.doshaAssessments].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  }

  getDoshaAssessments(patientId: string): DoshaAssessmentRecord[] {
    const patient = this.patientsData.find(p => p.id === patientId);
    if (!patient || !patient.doshaAssessments) return [];
    return [...patient.doshaAssessments].sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate));
  }

  getDoshaAssessmentTrend(patientId: string, limit = 3): DoshaAssessmentRecord[] {
    return this.getDoshaAssessments(patientId).slice(0, limit);
  }

  replaceDoshaAssessments(patientId: string, records: DoshaAssessmentRecord[]): boolean {
    const patient = this.patientsData.find((p) => p.id === patientId);
    if (!patient) return false;
    patient.doshaAssessments = [...(records || [])].map((record) => this.normalizeAssessmentRecord(record));
    return this.savePatientsData();
  }

  replaceDoshaDraft(patientId: string, draft: DoshaAssessmentDraft | null): boolean {
    const patient = this.patientsData.find((p) => p.id === patientId);
    if (!patient) return false;
    if (!draft) {
      delete patient.doshaAssessmentDraft;
      return this.savePatientsData();
    }
    patient.doshaAssessmentDraft = {
      patientId,
      currentStep: Number(draft.currentStep || 0),
      stage: draft.stage || 'intro',
      answers: { ...(draft.answers || {}) },
      selectedSymptoms: Array.isArray(draft.selectedSymptoms) ? [...draft.selectedSymptoms] : [],
      noSymptoms: !!draft.noSymptoms,
      submitToken: String(draft.submitToken || `resume_${Date.now()}`),
      updatedAt: draft.updatedAt || new Date().toISOString()
    };
    return this.savePatientsData();
  }

  private findAssessmentById(patientId: string, assessmentId: string): DoshaAssessmentRecord | undefined {
    const patient = this.patientsData.find((p) => p.id === patientId);
    return patient?.doshaAssessments?.find((r) => r.id === assessmentId);
  }

  private getSubmitTokenMap(): Record<string, string> {
    const raw = localStorage.getItem(this.DOSHA_SUBMIT_TOKENS_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private saveSubmitTokenMap(map: Record<string, string>): void {
    try {
      localStorage.setItem(this.DOSHA_SUBMIT_TOKENS_KEY, JSON.stringify(map));
    } catch {
      // noop
    }
  }

  addAppointment(patientId: string, appointment: Appointment): boolean {
    const patient = this.patientsData.find(p => p.id === patientId);
    if (!patient) return false;
    if (!patient.appointments) patient.appointments = [];
    patient.appointments.push(appointment);
    this.savePatientsData();
    return true;
  }

  addAppointmentAndReturnIndex(patientId: string, appointment: Appointment): number | null {
    const patient = this.patientsData.find(p => p.id === patientId);
    if (!patient) return null;
    if (!patient.appointments) patient.appointments = [];
    patient.appointments.push(appointment);
    this.savePatientsData();
    return patient.appointments.length - 1;
  }

  removeAppointment(patientId: string, index: number): boolean {
    const patient = this.patientsData.find(p => p.id === patientId);
    if (!patient || !patient.appointments) return false;
    if (index < 0 || index >= patient.appointments.length) return false;
    patient.appointments.splice(index, 1);
    this.savePatientsData();
    return true;
  }

  private normalizeAssessmentRecord(record: DoshaAssessmentRecord): DoshaAssessmentRecord {
    const assessmentDate = record.assessmentDate || record.submittedAt || new Date().toISOString();
    const validTill = record.validTill || new Date(new Date(assessmentDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const legacyScores = record.scores || { vata: 0, pitta: 0, kapha: 0 };
    const legacyPrimary = record.primaryDosha || record.prakritiLabel || 'Vata';
    const legacySecondary = record.secondaryDosha;
    const legacyTotal = Math.max(legacyScores.vata + legacyScores.pitta + legacyScores.kapha, 1);
    const legacyOrdered = [legacyScores.vata, legacyScores.pitta, legacyScores.kapha].sort((a, b) => b - a);
    const legacyIsDual = legacyOrdered[0] === legacyOrdered[1];
    const rawPrakriti = (record as any).prakriti;
    const rawVikriti = (record as any).vikriti;
    const hasPrakritiObject = !!rawPrakriti && typeof rawPrakriti === 'object' && !!rawPrakriti.primary;
    const hasVikritiObject = !!rawVikriti && typeof rawVikriti === 'object' && !!rawVikriti.dominant;
    const legacyPrakritiFromString =
      typeof rawPrakriti === 'string' && (rawPrakriti === 'Vata' || rawPrakriti === 'Pitta' || rawPrakriti === 'Kapha')
        ? (rawPrakriti as DoshaType)
        : legacyPrimary;
    const legacyVikritiFromString =
      typeof rawVikriti === 'string' &&
      (rawVikriti === 'Vata' || rawVikriti === 'Pitta' || rawVikriti === 'Kapha' || rawVikriti === 'Balanced')
        ? (rawVikriti as DoshaType | 'Balanced')
        : (record.vikritiLabel as DoshaType | 'Balanced') || 'Balanced';

    return {
      ...record,
      source: record.source || 'self_assessed',
      assessmentDate,
      validTill,
      selfReported: record.selfReported !== false,
      prakriti: hasPrakritiObject
        ? rawPrakriti
        : {
            primary: legacyPrakritiFromString,
            secondary: legacySecondary,
            isDual: !!legacySecondary && legacyIsDual,
            scores: legacyScores,
            percentages: {
              vata: Math.round((legacyScores.vata / legacyTotal) * 100),
              pitta: Math.round((legacyScores.pitta / legacyTotal) * 100),
              kapha: Math.round((legacyScores.kapha / legacyTotal) * 100)
            }
          },
      vikriti: hasVikritiObject
        ? rawVikriti
        : {
            dominant: legacyVikritiFromString,
            severity: legacyVikritiFromString === 'Balanced' ? 'Balanced' : 'Low',
            symptomScores: { vata: 0, pitta: 0, kapha: 0 },
            symptoms: [],
            imbalanceFlag: legacyVikritiFromString !== 'Balanced' && legacyVikritiFromString !== legacyPrakritiFromString
          },
      prakritiLabel: record.prakritiLabel || legacyPrakritiFromString,
      vikritiLabel: record.vikritiLabel || legacyVikritiFromString,
      primaryDosha: legacyPrimary,
      secondaryDosha: legacySecondary,
      result: record.result || (legacySecondary ? `${legacyPrimary}-${legacySecondary}` : legacyPrimary),
      submittedAt: record.submittedAt || assessmentDate,
      scores: legacyScores
    };
  }

  private loadPatientsData(): void {
    const stored = localStorage.getItem(this.PATIENTS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as PatientData[];
        this.patientsData = parsed.map((p) => ({
          ...p,
          doshaAssessments: (p.doshaAssessments || []).map((r) => this.normalizeAssessmentRecord(r))
        }));
      } catch {
        // ignore and keep defaults
      }
    }
  }

  private savePatientsData(): boolean {
    try {
      localStorage.setItem(this.PATIENTS_KEY, JSON.stringify(this.patientsData));
      return true;
    } catch {
      return false;
    }
  }

  getPatientsForDoctor(doctorId: string): PatientData[] {
    const doctor = this.doctorsDirectory.find((d) => d.id === doctorId);
    if (!doctor) return [];
    const byAppointment = this.patientsData.filter((p) =>
      (p.appointments || []).some((a) => String(a.doctor || '').toLowerCase().includes(doctor.fullName.toLowerCase()))
    );
    return byAppointment.length > 0 ? byAppointment : [...this.patientsData];
  }

  // Return list of doctors (public view)
  getDoctors(): User[] {
    return [...this.doctorsDirectory];
  }

  // Update current user basic profile and persist to localStorage
  updateCurrentUser(user: Partial<User>): boolean {
    const current = this.getCurrentUser();
    if (!current) return false;
    const updated: User = { ...current, ...user };
    this.currentUserSubject.next(updated);
    localStorage.setItem(this.USER_KEY, JSON.stringify(updated));
    if (updated.role === 'patient') {
      const patient = this.getPatientData(updated.id);
      if (patient) {
        patient.name = updated.fullName;
        this.savePatientsData();
      }
    } else {
      const doctor = this.doctorsDirectory.find((d) => d.id === updated.id);
      if (doctor) {
        doctor.fullName = updated.fullName;
        doctor.phone = updated.phone || '';
        doctor.email = updated.email;
      }
    }
    this.syncCurrentUserProfileToServer(updated).catch(() => undefined);
    return true;
  }

  // Update patient data (name, wellnessMessage, etc.) and persist
  updatePatientData(updatedData: PatientData): boolean {
    const idx = this.patientsData.findIndex(p => p.id === updatedData.id);
    if (idx === -1) return false;
    this.patientsData[idx] = updatedData;
    this.savePatientsData();
    return true;
  }

  async login(email: string, password: string) {
    try {
      const authResult = await this.supabaseService.client.auth.signInWithPassword({ email, password });
      if (!authResult) throw new Error('Authentication service failed to respond');
      const { data, error } = authResult;
      if (error) throw error;
      
      // IMPORTANT: We must pass the token manually here because the interceptor
      // calls getSession() which may not have persisted the new session yet.
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error('Login succeeded but no access token received');

      const response = await firstValueFrom(
        this.http.get<{ user: any }>(`${this.AUTH_API_BASE}/me`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
      );

      const user = this.mapAuthUser(response.user);
      this.setSession(user);
      this.ensureUserProfileExists(user);
      
      return { success: true, user };
    } catch (err: any) {
      console.error('Login error:', err);
      return { success: false, error: err.message || 'Unable to login right now.' };
    }
  }

  async logout(): Promise<void> {
    await this.supabaseService.client.auth.signOut();
    this.clearSessionState();
    this.router.navigate(['/login']);
  }

  async register(input: {
    fullName: string;
    email: string;
    password: string;
    confirmPassword: string;
    role: 'patient' | 'doctor';
    medicalLicense?: string;
    specialization?: string;
    experience?: number;
    clinicName?: string;
    consultationFee?: number;
  }): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
      // We still use our backend signup proxy to ensure profile is created in 'users' table 
      // alongside Supabase Auth creation.
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; message: string }>(`${this.AUTH_API_BASE}/signup`, {
          name: String(input.fullName || '').trim(),
          email: String(input.email || '').trim().toLowerCase(),
          password: input.password,
          confirmPassword: String(input.confirmPassword || ''),
          role: input.role,
          medicalLicense: input.medicalLicense,
          specialization: input.specialization,
          experience: input.experience,
          clinicName: input.clinicName,
          consultationFee: input.consultationFee
        })
      );
      return {
        success: true,
        message: String(response.message || 'Account created successfully.')
      };
    } catch (err: any) {
      const message = err?.error?.error || err?.message || 'Unable to create account right now.';
      return { success: false, error: message };
    }
  }

  async forgotPassword(
    identifier: string,
    role: 'patient' | 'doctor'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.http.post<{ success: boolean; message: string }>(`${this.AUTH_API_BASE}/forgot-password`, {
          identifier: String(identifier || '').trim(),
          role
        })
      );
      return { success: true };
    } catch (err: any) {
      const message = err?.error?.error || err?.message || 'Unable to process forgot password request.';
      return { success: false, error: message };
    }
  }

  async resetPasswordWithOtp(
    identifier: string,
    otp: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.http.post(`${this.AUTH_API_BASE}/reset-password`, {
          identifier: String(identifier || '').trim(),
          otp: String(otp || '').trim(),
          newPassword
        })
      );
      this.clearSessionState();
      return { success: true };
    } catch (err: any) {
      const message = err?.error?.error || err?.message || 'Unable to reset password.';
      return { success: false, error: message };
    }
  }




  private async syncCurrentUserProfileToServer(user: User): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.put<{ user: { id: string; name: string; phone?: string; email?: string; role: 'patient' | 'doctor' } }>(
          `${this.AUTH_API_BASE}/me`,
          {
            name: String(user.fullName || '').trim(),
            phone: String(user.phone || '').trim()
          }
        )
      );
      const mapped = this.mapAuthUser(response.user);
      this.setSession(mapped);
    } catch (err) {
      console.error('Failed to sync profile with server:', err);
    }
  }
}
