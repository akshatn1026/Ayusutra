import { Injectable } from '@angular/core';
import { AuthService, DoshaAssessmentRecord, DoshaType, User } from './auth.service';
import {
  AppNotification,
  ChatMessage,
  ConsultationRecord,
  ConsultationMode,
  DietPlanRecord,
  DoctorProfile,
  HerbRecord,
  PharmacyOrder,
  PrescriptionRecord,
  RoutineSuggestion,
  TherapyBookingRequest,
  TherapyEligibilityResult,
  TherapyRecord
} from '../models/ayurveda.models';

type DietSeason = DietPlanRecord['season'];
type ClimateZone = 'tropical' | 'arid' | 'humid' | 'cold' | 'temperate' | 'coastal' | 'unknown';
type MealSlot = 'Early Morning' | 'Breakfast' | 'Lunch' | 'Evening Snack' | 'Dinner';
type RoutineBlock = RoutineSuggestion['block'];

interface DietMealBlueprint {
  recommended: string[];
  avoid: string[];
  explanation: string;
}

interface SeasonalAdjustment {
  note: string;
  recommended: Partial<Record<MealSlot, string[]>>;
  avoid: Partial<Record<MealSlot, string[]>>;
  globalAvoid: string[];
}

interface DietBasis {
  pacifyDosha: DoshaType;
  basis: DietPlanRecord['basis'];
  equalDominance: boolean;
}

interface GenerateDietInput {
  patientId: string;
  assessment: DoshaAssessmentRecord;
  season?: DietSeason;
  location?: string;
  dietaryPreference?: 'veg' | 'sattvic';
  foodAllergies?: string[];
  doctorRecommendations?: string[];
}

interface RoutineBasis {
  priority: 'vikriti' | 'prakriti';
  pacifyDosha: DoshaType;
  line: string;
  prakritiPrimary: DoshaType;
  prakritiSecondary?: DoshaType;
  vikritiDominant: DoshaType | 'Balanced';
  vikritiSeverity: DoshaAssessmentRecord['vikriti']['severity'];
}

export interface RoutinePlanRecord {
  basis: RoutineBasis;
  season: DietSeason;
  timezone: string;
  routine: RoutineSuggestion[];
  tips: string[];
}

interface GenerateRoutineInput {
  assessment: DoshaAssessmentRecord;
  season?: DietSeason;
  location?: string;
  timezone?: string;
  sleepSchedule?: 'day' | 'night';
}

export interface LifestyleProfile {
  activityLevel?: 'low' | 'moderate' | 'high';
  workRhythm?: 'desk' | 'mixed' | 'active';
  stressLevel?: 'low' | 'moderate' | 'high';
}

export interface DailyRoutineDigestRecord {
  generatedAt: string;
  dateKey: string;
  season: DietSeason;
  dosha: DoshaType;
  lifestyle: LifestyleProfile;
  items: RoutineSuggestion[];
  summary: string;
}

export interface ConsultationContextRecord {
  assessment: DoshaAssessmentRecord | null;
  diet: DietPlanRecord | null;
  routine: RoutinePlanRecord | null;
  pastSummaries: Array<{ consultationId: string; summary: string; completedAt: string }>;
}

interface StartConsultationInput {
  patientId: string;
  doctorId: string;
  linkedAssessmentId?: string;
  appointmentId?: string;
  initiationType?: 'instant' | 'appointment';
}

interface CreatePrescriptionInput {
  consultationId: string;
  doctorId: string;
  patientId: string;
  diagnosis: string;
  advice: string;
  precautions?: string;
  items: Array<{
    name?: string;
    medicine?: string;
    form: string;
    dosage: string;
    frequency: string;
    timing: string;
    duration: string;
    precautions?: string;
  }>;
  linkedDoshaAssessmentId?: string;
  doctorConfirmed: boolean;
}

export type NotificationFrequency = 'realtime' | 'balanced' | 'minimal';

export interface NotificationPreference {
  frequency: NotificationFrequency;
}

interface NotificationDeliveryOptions {
  contextKey?: string;
  valueScore?: number;
  force?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AyurvedaDataService {
  private readonly DOCTORS_KEY = 'ayusutra_doctors_v2';
  private readonly CONSULTATIONS_KEY = 'ayusutra_consultations_v2';
  private readonly PRESCRIPTIONS_KEY = 'ayusutra_prescriptions_v2';
  private readonly HERBS_KEY = 'ayusutra_herbs_v2';
  private readonly THERAPIES_KEY = 'ayusutra_therapies_v2';
  private readonly THERAPY_BOOKINGS_KEY = 'ayusutra_therapy_bookings_v2';
  private readonly ORDERS_KEY = 'ayusutra_orders_v2';
  private readonly NOTIFICATIONS_KEY = 'ayusutra_notifications_v2';
  private readonly NOTIFICATION_PREF_KEY_PREFIX = 'ayusutra_notification_pref_';
  private readonly DIETS_KEY = 'ayusutra_diets_v2';

  private doctors: DoctorProfile[] = [];
  private consultations: ConsultationRecord[] = [];
  private prescriptions: PrescriptionRecord[] = [];
  private herbs: HerbRecord[] = [];
  private therapies: TherapyRecord[] = [];
  private therapyBookings: TherapyBookingRequest[] = [];
  private orders: PharmacyOrder[] = [];
  private notifications: AppNotification[] = [];
  private diets: DietPlanRecord[] = [];

  constructor(private auth: AuthService) {
    this.loadAll();
  }

  reloadFromStorage(): void {
    this.loadAll();
  }

  private loadAll(): void {
    this.doctors = this.load<DoctorProfile[]>(this.DOCTORS_KEY, this.defaultDoctors());
    this.consultations = this
      .load<ConsultationRecord[]>(this.CONSULTATIONS_KEY, this.defaultConsultations())
      .map((c) => this.normalizeConsultation(c));
    this.prescriptions = this.load<PrescriptionRecord[]>(this.PRESCRIPTIONS_KEY, []);
    this.herbs = this.load<HerbRecord[]>(this.HERBS_KEY, this.defaultHerbs());
    this.therapies = this
      .load<TherapyRecord[]>(this.THERAPIES_KEY, this.defaultTherapies())
      .map((item) => this.normalizeTherapy(item));
    this.therapyBookings = this
      .load<TherapyBookingRequest[]>(this.THERAPY_BOOKINGS_KEY, [])
      .map((item) => this.normalizeTherapyRequest(item));
    this.orders = this.load<PharmacyOrder[]>(this.ORDERS_KEY, []);
    this.notifications = this.load<AppNotification[]>(this.NOTIFICATIONS_KEY, []);
    this.diets = this.load<DietPlanRecord[]>(this.DIETS_KEY, []);
  }

  private load<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private save<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // noop
    }
  }

  private persistAll(): void {
    this.save(this.DOCTORS_KEY, this.doctors);
    this.save(this.CONSULTATIONS_KEY, this.consultations);
    this.save(this.PRESCRIPTIONS_KEY, this.prescriptions);
    this.save(this.HERBS_KEY, this.herbs);
    this.save(this.THERAPIES_KEY, this.therapies);
    this.save(this.THERAPY_BOOKINGS_KEY, this.therapyBookings);
    this.save(this.ORDERS_KEY, this.orders);
    this.save(this.NOTIFICATIONS_KEY, this.notifications);
    this.save(this.DIETS_KEY, this.diets);
  }

  getDoctors(): DoctorProfile[] {
    return [...this.doctors];
  }

  getDoctorById(id: string): DoctorProfile | undefined {
    return this.doctors.find((d) => d.id === id);
  }

  getConsultationsForPatient(patientId: string): ConsultationRecord[] {
    return this.consultations
      .filter((c) => c.patientId === patientId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  getConsultationsForDoctor(doctorId: string): ConsultationRecord[] {
    return this.consultations
      .filter((c) => c.doctorId === doctorId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  canStartConsultation(patientId: string, doctorId: string): { allowed: boolean; reason?: string } {
    const doctor = this.getDoctorById(doctorId);
    if (!doctor) return { allowed: false, reason: 'Doctor not found.' };
    if (!doctor.verified) return { allowed: false, reason: 'Doctor is not verified for online consultation.' };

    const patient = this.auth.getPatientData(patientId);
    const appointmentExists = !!patient?.appointments?.some((a) =>
      a.status.toLowerCase() === 'confirmed' && a.doctor.toLowerCase().includes(doctor.fullName.toLowerCase())
    );

    if (appointmentExists) return { allowed: true };
    return { allowed: true };
  }

  getActiveConsultationBetween(patientId: string, doctorId: string): ConsultationRecord | undefined {
    return this.consultations
      .filter((c) => c.patientId === patientId && c.doctorId === doctorId && c.status === 'active')
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  }

  startConsultation(input: StartConsultationInput): ConsultationRecord;
  startConsultation(patientId: string, doctorId: string): ConsultationRecord;
  startConsultation(patientIdOrInput: string | StartConsultationInput, doctorIdArg?: string): ConsultationRecord {
    const input: StartConsultationInput =
      typeof patientIdOrInput === 'string'
        ? { patientId: patientIdOrInput, doctorId: doctorIdArg || '', initiationType: 'instant' }
        : patientIdOrInput;
    const gate = this.canStartConsultation(input.patientId, input.doctorId);
    if (!gate.allowed) throw new Error(gate.reason || 'Consultation cannot be started.');

    const active = this.getActiveConsultationBetween(input.patientId, input.doctorId);
    if (active) return this.normalizeConsultation(active);

    const now = new Date().toISOString();
    const record: ConsultationRecord = {
      id: `consult_${Date.now()}`,
      sessionId: `session_${Date.now()}`,
      patientId: input.patientId,
      doctorId: input.doctorId,
      startedAt: now,
      startTime: now,
      endTime: undefined,
      modeUsed: ['chat'],
      linkedAssessmentId: input.linkedAssessmentId || this.auth.getLatestDoshaAssessment(input.patientId)?.id,
      appointmentId: input.appointmentId,
      initiationType: input.initiationType || 'instant',
      encryption: 'session-encrypted',
      participantsJoined: { patient: true, doctor: false },
      lastHeartbeatAt: now,
      readOnlyAfterClose: false,
      status: 'active',
      activeMode: 'chat',
      modeHistory: [{ mode: 'chat', switchedAt: now }],
      messages: [
        {
          id: `msg_${Date.now()}_system`,
          sender: 'system',
          text: 'Consultation started. Share your current symptoms and concerns.',
          createdAt: now,
          deliveryStatus: 'received'
        }
      ],
      files: []
    };
    this.consultations.push(record);
    this.persistAll();
    return this.normalizeConsultation(record);
  }

  getConsultationById(id: string): ConsultationRecord | undefined {
    const found = this.consultations.find((c) => c.id === id || c.sessionId === id);
    if (!found) return undefined;
    if (this.hasConsultationTimedOut(found)) {
      return this.closeConsultation(found.id, 'system', 'Session auto-closed due to inactivity.');
    }
    return this.normalizeConsultation(found);
  }

  markParticipantJoined(consultationId: string, role: User['role']): ConsultationRecord | undefined {
    const record = this.consultations.find((c) => c.id === consultationId || c.sessionId === consultationId);
    if (!record) return undefined;
    if (!record.participantsJoined) record.participantsJoined = { patient: false, doctor: false };
    if (role === 'doctor') record.participantsJoined.doctor = true;
    if (role === 'patient') record.participantsJoined.patient = true;
    record.lastHeartbeatAt = new Date().toISOString();
    this.persistAll();
    return this.normalizeConsultation(record);
  }

  canAccessConsultation(consultationId: string, user: User | null): { allowed: boolean; reason?: string } {
    if (!user) return { allowed: false, reason: 'Login required.' };
    const record = this.getConsultationById(consultationId);
    if (!record) return { allowed: false, reason: 'Session not found.' };
    if (user.id !== record.patientId && user.id !== record.doctorId) {
      return { allowed: false, reason: 'You are not allowed to access this consultation session.' };
    }
    const doctor = this.getDoctorById(record.doctorId);
    if (!doctor || !doctor.verified) return { allowed: false, reason: 'Doctor verification is required.' };
    return { allowed: true };
  }

  getConsultationBySessionId(sessionId: string): ConsultationRecord | undefined {
    return this.getConsultationById(sessionId);
  }

  switchConsultationMode(consultationId: string, mode: ConsultationMode): ConsultationRecord | undefined {
    const record = this.consultations.find((c) => c.id === consultationId || c.sessionId === consultationId);
    if (!record) return undefined;
    if (record.status !== 'active') return this.normalizeConsultation(record);
    if ((mode === 'audio' || mode === 'video') && record.status !== 'active') {
      mode = 'chat';
    }
    record.activeMode = mode;
    record.modeHistory.push({ mode, switchedAt: new Date().toISOString() });
    if (!record.modeUsed) record.modeUsed = [];
    if (!record.modeUsed.includes(mode)) record.modeUsed.push(mode);
    record.lastHeartbeatAt = new Date().toISOString();
    this.persistAll();
    return this.normalizeConsultation(record);
  }

  addConsultationMessage(consultationId: string, sender: ChatMessage['sender'], text: string): ChatMessage | null {
    const record = this.consultations.find((c) => c.id === consultationId || c.sessionId === consultationId);
    if (!record) return null;
    if (record.status !== 'active') return null;
    const message: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender,
      text,
      createdAt: new Date().toISOString(),
      deliveryStatus: sender === 'system' ? 'received' : 'sent'
    };
    record.messages.push(message);
    record.messages = [...record.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    record.lastHeartbeatAt = new Date().toISOString();
    this.persistAll();
    return message;
  }

  addConsultationFile(
    consultationId: string,
    file: { name: string; sizeKb: number; mimeType: string; uploadedBy: 'patient' | 'doctor' }
  ): boolean {
    const record = this.consultations.find((c) => c.id === consultationId || c.sessionId === consultationId);
    if (!record) return false;
    if (record.status !== 'active') return false;
    const allowedMime = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedMime.includes(file.mimeType)) return false;
    record.files.push({
      id: `file_${Date.now()}`,
      name: file.name,
      sizeKb: file.sizeKb,
      mimeType: file.mimeType,
      type: file.mimeType === 'application/pdf' ? 'report' : 'image',
      uploadedBy: file.uploadedBy,
      uploadedAt: new Date().toISOString()
    });
    record.lastHeartbeatAt = new Date().toISOString();
    this.persistAll();
    return true;
  }

  reportNetworkIssue(consultationId: string): ConsultationRecord | undefined {
    const record = this.consultations.find((c) => c.id === consultationId || c.sessionId === consultationId);
    if (!record) return undefined;
    record.lastNetworkIssueAt = new Date().toISOString();
    if (record.activeMode !== 'chat') {
      record.activeMode = 'chat';
      record.modeHistory.push({ mode: 'chat', switchedAt: new Date().toISOString() });
      if (!record.modeUsed) record.modeUsed = [];
      if (!record.modeUsed.includes('chat')) record.modeUsed.push('chat');
      record.messages.push({
        id: `msg_${Date.now()}_system_net`,
        sender: 'system',
        text: 'Audio/video interruption detected. Session has safely fallen back to chat.',
        createdAt: new Date().toISOString(),
        deliveryStatus: 'received'
      });
    }
    this.persistAll();
    return this.normalizeConsultation(record);
  }

  heartbeatConsultation(consultationId: string): ConsultationRecord | undefined {
    const record = this.consultations.find((c) => c.id === consultationId || c.sessionId === consultationId);
    if (!record) return undefined;
    record.lastHeartbeatAt = new Date().toISOString();
    record.messages = (record.messages || []).map((m) => {
      if (m.deliveryStatus !== 'sent') return m;
      const age = Date.now() - new Date(m.createdAt).getTime();
      if (age < 1500) return m;
      return { ...m, deliveryStatus: 'received' };
    });
    const timedOut = this.hasConsultationTimedOut(record);
    if (timedOut && record.status === 'active') {
      return this.closeConsultation(consultationId, 'system', 'Session auto-closed due to timeout.');
    }
    this.persistAll();
    return this.normalizeConsultation(record);
  }

  closeConsultation(
    consultationId: string,
    endedBy: 'doctor' | 'patient' | 'system',
    reason = 'Consultation completed.'
  ): ConsultationRecord | undefined {
    const record = this.consultations.find((c) => c.id === consultationId || c.sessionId === consultationId);
    if (!record) return undefined;
    if (record.status !== 'active') return this.normalizeConsultation(record);
    const now = new Date().toISOString();
    record.status = 'completed';
    record.endTime = now;
    record.readOnlyAfterClose = true;
    record.modeHistory.push({ mode: 'chat', switchedAt: now });
    record.activeMode = 'chat';
    record.messages.push({
      id: `msg_${Date.now()}_system_end`,
      sender: 'system',
      text: `${reason} Ended by ${endedBy}.`,
      createdAt: now,
      deliveryStatus: 'received'
    });
    record.summary = record.summary || this.generateConsultationSummary(record);
    this.persistAll();
    return this.normalizeConsultation(record);
  }

  getDoctorConsultationContext(consultationId: string, doctorId: string): ConsultationContextRecord | null {
    const consult = this.getConsultationById(consultationId);
    if (!consult || consult.doctorId !== doctorId) return null;

    const assessment = this.auth.getLatestDoshaAssessment(consult.patientId) || null;
    const diet = this.getDietPlanForPatient(consult.patientId) || null;
    const routine = assessment
      ? this.getPersonalizedRoutine({
          assessment,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        })
      : null;
    const pastSummaries = this.consultations
      .filter((c) => c.patientId === consult.patientId && c.doctorId === doctorId && c.id !== consult.id && c.status === 'completed')
      .sort((a, b) => (b.endTime || b.startedAt).localeCompare(a.endTime || a.startedAt))
      .slice(0, 5)
      .map((c) => ({
        consultationId: c.id,
        summary: c.summary || this.generateConsultationSummary(c),
        completedAt: c.endTime || c.startedAt
      }));

    return { assessment, diet, routine, pastSummaries };
  }

  createPrescription(input: CreatePrescriptionInput): { success: boolean; record?: PrescriptionRecord; error?: string } {
    const doctor = this.getDoctorById(input.doctorId);
    if (!doctor || !doctor.verified) {
      return { success: false, error: 'Only verified doctors can create prescriptions.' };
    }
    const consultation = this.getConsultationById(input.consultationId);
    if (!consultation) {
      return { success: false, error: 'Consultation not found.' };
    }
    if (consultation.status !== 'completed') {
      return { success: false, error: 'Prescription can only be created after consultation ends.' };
    }
    if (consultation.doctorId !== input.doctorId || consultation.patientId !== input.patientId) {
      return { success: false, error: 'Prescription participants do not match consultation.' };
    }
    if (!input.doctorConfirmed) {
      return { success: false, error: 'Doctor confirmation is required before finalizing prescription.' };
    }

    const medicines = input.items
      .map((item) => ({
        name: (item.name || item.medicine || '').trim(),
        form: (item.form || '').trim(),
        dosage: (item.dosage || '').trim(),
        frequency: (item.frequency || '').trim(),
        timing: (item.timing || '').trim(),
        duration: (item.duration || '').trim(),
        precautions: (item.precautions || '').trim()
      }))
      .filter((item) => !!item.name || !!item.form || !!item.dosage || !!item.duration || !!item.frequency || !!item.timing);

    if (medicines.length === 0) {
      return { success: false, error: 'At least one medicine is required.' };
    }
    const hasInvalid = medicines.some(
      (m) => !m.name || !m.form || !m.dosage || !m.duration || !m.frequency || !m.timing
    );
    if (hasInvalid) {
      return { success: false, error: 'Each medicine must include name, form, dosage, frequency, timing, and duration.' };
    }

    const existing = this.prescriptions.find((p) => p.consultationId === input.consultationId && p.finalized);
    if (existing) {
      return { success: false, error: 'Prescription already finalized for this consultation and cannot be modified.' };
    }

    const patientProfile = this.auth.getPatientData(input.patientId);
    const createdAt = new Date().toISOString();
    const record: PrescriptionRecord = {
      id: `rx_${Date.now()}`,
      prescriptionId: `rx_${Date.now()}`,
      consultationId: input.consultationId,
      doctorId: input.doctorId,
      patientId: input.patientId,
      patientName: patientProfile?.name || 'Patient',
      patientAge: (patientProfile as any)?.age ? String((patientProfile as any).age) : 'N/A',
      doctorName: doctor.fullName,
      doctorRegistration: (doctor as any).registration || 'Registration pending',
      diagnosis: input.diagnosis.trim(),
      advice: input.advice.trim(),
      precautions: (input.precautions || '').trim(),
      items: medicines.map((m) => ({
        name: m.name,
        medicine: m.name,
        form: m.form,
        dosage: m.dosage,
        frequency: m.frequency,
        duration: m.duration,
        timing: m.timing,
        precautions: m.precautions || undefined
      })),
      medicines: medicines.map((m) => ({
        name: m.name,
        form: m.form,
        dosage: m.dosage,
        frequency: m.frequency,
        timing: m.timing,
        duration: m.duration
      })),
      linkedDoshaAssessmentId: input.linkedDoshaAssessmentId,
      status: 'active',
      finalized: true,
      createdBy: input.doctorId,
      audit: { createdAt, createdBy: input.doctorId },
      digitalSignatureMarker: `Digitally signed by ${doctor.fullName} (${input.doctorId})`,
      createdAt
    };

    this.prescriptions.push(record);
    this.persistAll();
    return { success: true, record };
  }

  buildPrescription(input: Omit<PrescriptionRecord, 'id' | 'createdAt'>): PrescriptionRecord {
    const result = this.createPrescription({
      consultationId: input.consultationId,
      doctorId: input.doctorId,
      patientId: input.patientId,
      diagnosis: input.diagnosis,
      advice: input.advice,
      precautions: input.precautions,
      items: (input.items || []).map((i) => ({
        name: i.name || i.medicine,
        medicine: i.medicine,
        form: i.form,
        dosage: i.dosage,
        frequency: i.frequency,
        timing: i.timing,
        duration: i.duration,
        precautions: i.precautions
      })),
      linkedDoshaAssessmentId: input.linkedDoshaAssessmentId,
      doctorConfirmed: true
    });
    if (!result.success || !result.record) {
      throw new Error(result.error || 'Unable to build prescription');
    }
    return result.record;
  }

  getPrescriptionsForPatient(patientId: string): PrescriptionRecord[] {
    return this.prescriptions
      .filter((p) => p.patientId === patientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getPrescriptionsForDoctor(doctorId: string): PrescriptionRecord[] {
    return this.prescriptions
      .filter((p) => p.doctorId === doctorId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getPrescriptionByConsultation(consultationId: string): PrescriptionRecord | undefined {
    return this.prescriptions.find((p) => p.consultationId === consultationId);
  }

  getPrescriptionById(prescriptionId: string): PrescriptionRecord | undefined {
    return this.prescriptions.find((p) => p.id === prescriptionId || p.prescriptionId === prescriptionId);
  }

  getHerbs(query = ''): HerbRecord[] {
    if (!query.trim()) return [...this.herbs];
    const q = query.trim().toLowerCase();
    return this.herbs.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.benefits.some((b) => b.toLowerCase().includes(q)) ||
        h.references.some((r) => r.toLowerCase().includes(q))
    );
  }

  getHerbById(id: string): HerbRecord | undefined {
    return this.herbs.find((h) => h.id === id);
  }

  updateHerbByVerifiedRole(id: string, payload: Partial<HerbRecord>, role: 'patient' | 'doctor' | 'admin'): boolean {
    if (role === 'patient') return false;
    const herb = this.herbs.find((h) => h.id === id);
    if (!herb) return false;
    if (!herb.editableBy.includes(role)) return false;
    Object.assign(herb, payload);
    this.persistAll();
    return true;
  }

  getTherapies(): TherapyRecord[] {
    return [...this.therapies].sort((a, b) => a.name.localeCompare(b.name));
  }

  getTherapyById(therapyId: string): TherapyRecord | undefined {
    return this.therapies.find((t) => t.id === therapyId || t.therapyId === therapyId);
  }

  checkTherapyEligibility(
    therapyId: string,
    latestDosha: DoshaAssessmentRecord | null,
    options?: { age?: number; isPregnant?: boolean }
  ): TherapyEligibilityResult {
    const therapy = this.getTherapyById(therapyId);
    if (!therapy) {
      return {
        therapyId,
        outcome: 'not_recommended',
        reason: 'Therapy not found.',
        blocked: true,
        requiresDoctorApproval: true,
        basis: { vikriti: 'Balanced', severity: 'Balanced', prakriti: 'Vata' }
      };
    }
    if (!latestDosha) {
      return {
        therapyId: therapy.id,
        outcome: 'not_recommended',
        reason: 'Dosha assessment is required before requesting therapy.',
        blocked: true,
        requiresDoctorApproval: true,
        basis: { vikriti: 'Balanced', severity: 'Balanced', prakriti: 'Vata' }
      };
    }

    const prakriti = latestDosha.prakriti?.primary || latestDosha.primaryDosha;
    const secondaryPrakriti = latestDosha.prakriti?.secondary || latestDosha.secondaryDosha;
    const vikriti = latestDosha.vikriti?.dominant || 'Balanced';
    const severity = latestDosha.vikriti?.severity || 'Balanced';
    const age = options?.age || 0;
    const isPregnant = !!options?.isPregnant;

    if (isPregnant && therapy.category === 'panchakarma') {
      return {
        therapyId: therapy.id,
        outcome: 'not_recommended',
        reason: 'Pregnancy safety rule: Panchakarma is blocked and requires direct physician alternative planning.',
        blocked: true,
        requiresDoctorApproval: true,
        basis: { vikriti, severity, prakriti, secondaryPrakriti }
      };
    }
    if (age > 0 && age < 18 && therapy.category === 'panchakarma') {
      return {
        therapyId: therapy.id,
        outcome: 'not_recommended',
        reason: 'Panchakarma for minors must be deferred to specialized in-person physician assessment.',
        blocked: true,
        requiresDoctorApproval: true,
        basis: { vikriti, severity, prakriti, secondaryPrakriti }
      };
    }
    if (vikriti !== 'Balanced' && therapy.doshaIndications.avoidFor.includes(vikriti)) {
      return {
        therapyId: therapy.id,
        outcome: 'not_recommended',
        reason: `${therapy.name} is currently not recommended for ${vikriti} aggravation.`,
        blocked: true,
        requiresDoctorApproval: true,
        basis: { vikriti, severity, prakriti, secondaryPrakriti }
      };
    }

    if (severity === 'High' && therapy.intensityLevel === 'high') {
      return {
        therapyId: therapy.id,
        outcome: 'conditional',
        reason: `High ${vikriti} severity needs supervised planning before ${therapy.name}.`,
        blocked: false,
        requiresDoctorApproval: true,
        basis: { vikriti, severity, prakriti, secondaryPrakriti }
      };
    }

    const priorityDosha = vikriti !== 'Balanced' ? vikriti : prakriti;
    const recommendedForPriority = therapy.doshaIndications.recommendedFor.includes(priorityDosha);
    const recommendedForSecondary = !!secondaryPrakriti && therapy.doshaIndications.recommendedFor.includes(secondaryPrakriti);
    if (recommendedForPriority) {
      return {
        therapyId: therapy.id,
        outcome: therapy.requiresDoctorApproval ? 'conditional' : 'eligible',
        reason: `Aligned with your ${priorityDosha} priority. ${therapy.requiresDoctorApproval ? 'Doctor review is mandatory.' : ''}`.trim(),
        blocked: false,
        requiresDoctorApproval: therapy.requiresDoctorApproval,
        basis: { vikriti, severity, prakriti, secondaryPrakriti }
      };
    }
    if (recommendedForSecondary) {
      return {
        therapyId: therapy.id,
        outcome: 'conditional',
        reason: `Can be considered with secondary prakriti (${secondaryPrakriti}) support after doctor review.`,
        blocked: false,
        requiresDoctorApproval: true,
        basis: { vikriti, severity, prakriti, secondaryPrakriti }
      };
    }

    return {
      therapyId: therapy.id,
      outcome: 'not_recommended',
      reason: 'This therapy is not aligned with your current dosha priority.',
      blocked: true,
      requiresDoctorApproval: true,
      basis: { vikriti, severity, prakriti, secondaryPrakriti }
    };
  }

  createTherapyBooking(
    patientId: string,
    therapyId: string,
    preferredDate: string,
    doctorId?: string
  ): { success: boolean; request?: TherapyBookingRequest; error?: string } {
    const therapy = this.getTherapyById(therapyId);
    if (!therapy) return { success: false, error: 'Therapy not found.' };
    const latestDosha = this.auth.getLatestDoshaAssessment(patientId) || null;
    if (!latestDosha) return { success: false, error: 'Complete dosha assessment before requesting therapy.' };
    if (!preferredDate) return { success: false, error: 'Preferred date is required.' };

    const patient = this.auth.getPatientData(patientId) as any;
    const age = Number(patient?.age || 0);
    const patientConditions: string[] = (patient?.medicalHistory || [])
      .map((m: { condition?: string }) => String(m?.condition || '').toLowerCase())
      .filter((v: string) => !!v);
    const contraindicationHit = therapy.contraindications.find((rule) =>
      patientConditions.some((c) => c.includes(rule.toLowerCase()) || rule.toLowerCase().includes(c))
    );
    if (contraindicationHit) {
      return { success: false, error: `Request blocked due to contraindication match: ${contraindicationHit}.` };
    }
    const eligibility = this.checkTherapyEligibility(therapy.id, latestDosha, {
      age: Number.isFinite(age) ? age : 0,
      isPregnant: !!patient?.isPregnant
    });
    if (eligibility.blocked) return { success: false, error: eligibility.reason };

    const requestId = `therapy_req_${Date.now()}`;
    const request: TherapyBookingRequest = {
      id: requestId,
      requestId,
      therapyId: therapy.id,
      patientId,
      doctorId: doctorId || this.getDefaultDoctorId(),
      preferredDate,
      status: 'pending',
      eligibility,
      doctorNotes: '',
      preTherapyChecklist: therapy.preTherapyGuidelines.map((item) => ({ item, acknowledged: false })),
      postTherapyCare: [...therapy.postTherapyCare],
      progressNotes: [],
      createdAt: new Date().toISOString()
    };
    this.therapyBookings.push(request);
    this.persistAll();
    return { success: true, request };
  }

  getTherapyBookingsForPatient(patientId: string): TherapyBookingRequest[] {
    return this.therapyBookings
      .filter((b) => b.patientId === patientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getTherapyBookingsForDoctor(doctorId: string): TherapyBookingRequest[] {
    return this.therapyBookings
      .filter((b) => b.doctorId === doctorId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  reviewTherapyRequest(
    doctorId: string,
    requestId: string,
    action: 'approved' | 'rejected' | 'pending',
    doctorNotes: string
  ): { success: boolean; error?: string } {
    const doctor = this.getDoctorById(doctorId);
    if (!doctor || !doctor.verified) return { success: false, error: 'Only verified doctors can review therapy requests.' };
    const request = this.therapyBookings.find((r) => r.id === requestId || r.requestId === requestId);
    if (!request) return { success: false, error: 'Therapy request not found.' };
    if (request.doctorId !== doctorId) return { success: false, error: 'Doctor cannot review this request.' };
    request.status = action;
    request.doctorNotes = (doctorNotes || '').trim();
    request.reviewedAt = new Date().toISOString();
    this.persistAll();
    return { success: true };
  }

  acknowledgePreTherapyChecklist(patientId: string, requestId: string): { success: boolean; error?: string } {
    const request = this.therapyBookings.find((r) => (r.id === requestId || r.requestId === requestId) && r.patientId === patientId);
    if (!request) return { success: false, error: 'Therapy request not found.' };
    if (request.status !== 'approved') return { success: false, error: 'Checklist is available only after doctor approval.' };
    request.preTherapyChecklist = (request.preTherapyChecklist || []).map((item) => ({
      ...item,
      acknowledged: true,
      acknowledgedAt: new Date().toISOString()
    }));
    this.persistAll();
    return { success: true };
  }

  addTherapyProgressNote(patientId: string, requestId: string, note: string): { success: boolean; error?: string } {
    const request = this.therapyBookings.find((r) => (r.id === requestId || r.requestId === requestId) && r.patientId === patientId);
    if (!request) return { success: false, error: 'Therapy request not found.' };
    if (request.status !== 'approved') return { success: false, error: 'Progress notes can be added only after approval.' };
    const clean = (note || '').trim();
    if (!clean) return { success: false, error: 'Progress note is required.' };
    if (!request.progressNotes) request.progressNotes = [];
    request.progressNotes.push({ note: clean, createdAt: new Date().toISOString() });
    this.persistAll();
    return { success: true };
  }

  private getDefaultDoctorId(): string {
    return this.doctors.find((d) => d.verified)?.id || this.doctors[0]?.id || '';
  }

  placeOrder(input: Omit<PharmacyOrder, 'id' | 'createdAt' | 'status'>): PharmacyOrder {
    const order: PharmacyOrder = {
      ...input,
      id: `order_${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: 'placed'
    };
    this.orders.push(order);
    this.persistAll();
    return order;
  }

  getOrdersForPatient(patientId: string): PharmacyOrder[] {
    return this.orders.filter((o) => o.patientId === patientId);
  }

  generateDietPlan(input: GenerateDietInput): DietPlanRecord;
  generateDietPlan(patientId: string, assessment: DoshaAssessmentRecord): DietPlanRecord;
  generateDietPlan(patientId: string, dosha: DoshaType): DietPlanRecord;
  generateDietPlan(
    patientIdOrInput: string | GenerateDietInput,
    assessmentOrDosha?: DoshaAssessmentRecord | DoshaType
  ): DietPlanRecord {
    const input = this.normalizeDietInput(patientIdOrInput, assessmentOrDosha);
    let plan: DietPlanRecord;

    try {
      plan = this.buildDietPlan(input);
    } catch {
      plan = this.buildFallbackDietPlan(input);
    }

    this.diets = this.diets.filter((d) => d.patientId !== input.patientId);
    this.diets.push(plan);
    this.persistAll();
    return plan;
  }

  getDietPlanForPatient(patientId: string): DietPlanRecord | undefined {
    return this.diets
      .filter((d) => d.patientId === patientId)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
  }

  getPersonalizedRoutine(input: GenerateRoutineInput): RoutinePlanRecord {
    const climateZone = this.inferClimateZone(input.location);
    const season = input.season || this.resolveSeason(input.location);
    const timezone = input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const basis = this.resolveRoutineBasis(input.assessment);
    const sleepSchedule = input.sleepSchedule || 'day';
    const base = this.routineBlueprintByDosha(basis.pacifyDosha, sleepSchedule);
    const seasonal = this.applyRoutineSeasonalAdjustment(base, season, basis.pacifyDosha, climateZone);

    return {
      basis,
      season,
      timezone,
      routine: seasonal,
      tips: [
        basis.line,
        'Routine is supportive, not prescriptive. Adjust gradually and seek physician advice for persistent symptoms.',
        sleepSchedule === 'night'
          ? 'Night-shift adjustment applied: maintain fixed sleep window and anchor meals.'
          : 'Keep wake, meals, and sleep timings consistent to stabilize dosha rhythms.'
      ]
    };
  }

  getRoutineForAssessment(
    assessment: DoshaAssessmentRecord,
    options?: { season?: DietSeason; location?: string; timezone?: string; sleepSchedule?: 'day' | 'night' }
  ): RoutineSuggestion[] {
    return this.getPersonalizedRoutine({
      assessment,
      season: options?.season,
      location: options?.location,
      timezone: options?.timezone,
      sleepSchedule: options?.sleepSchedule
    }).routine;
  }

  getDailyRoutineDigest(input: {
    patientId: string;
    assessment: DoshaAssessmentRecord;
    season?: DietSeason;
    location?: string;
    timezone?: string;
    sleepSchedule?: 'day' | 'night';
    lifestyle?: LifestyleProfile;
  }): DailyRoutineDigestRecord {
    const patientId = String(input.patientId || '').trim();
    const season = input.season || this.resolveSeason(input.location);
    const climateZone = this.inferClimateZone(input.location);
    const timezone = input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const sleepSchedule = input.sleepSchedule || 'day';
    const lifestyle = input.lifestyle || {};
    const dateKey = new Date().toISOString().slice(0, 10);
    const contextKey = JSON.stringify({
      dateKey,
      season,
      climateZone,
      timezone,
      sleepSchedule,
      lifestyle,
      dosha: input.assessment.vikriti?.dominant || input.assessment.prakriti?.primary || input.assessment.primaryDosha || 'Vata'
    });
    const storageKey = `ayusutra_daily_routine_digest_${patientId || 'anon'}`;

    if (patientId) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { contextKey?: string; digest?: DailyRoutineDigestRecord };
          if (parsed?.contextKey === contextKey && parsed?.digest?.items?.length) {
            return parsed.digest;
          }
        }
      } catch {
        // noop
      }
    }

    const plan = this.getPersonalizedRoutine({
      assessment: input.assessment,
      season,
      location: input.location,
      timezone,
      sleepSchedule
    });
    const items = this.compactRoutineItems(plan.routine, lifestyle, `${dateKey}:${contextKey}`).slice(0, 5);
    const digest: DailyRoutineDigestRecord = {
      generatedAt: new Date().toISOString(),
      dateKey,
      season,
      dosha: plan.basis.pacifyDosha,
      lifestyle,
      items,
      summary:
        climateZone === 'unknown'
          ? `Today: ${plan.basis.pacifyDosha}-supportive ${season} routine in ${timezone}. Keep it simple and consistent.`
          : `Today: ${plan.basis.pacifyDosha}-supportive ${season} routine for ${climateZone} climate in ${timezone}.`
    };

    if (patientId) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ contextKey, digest }));
      } catch {
        // noop
      }
    }
    return digest;
  }

  getRoutineForDosha(dosha: DoshaType): RoutineSuggestion[] {
    const fallbackAssessment: DoshaAssessmentRecord = {
      id: `routine_legacy_${dosha}`,
      userId: 'legacy',
      source: 'self_assessed',
      assessmentDate: new Date().toISOString(),
      validTill: new Date().toISOString(),
      selfReported: true,
      answers: {},
      scores: { vata: 0, pitta: 0, kapha: 0 },
      prakriti: {
        primary: dosha,
        isDual: false,
        scores: { vata: 0, pitta: 0, kapha: 0 },
        percentages: { vata: 0, pitta: 0, kapha: 0 }
      },
      vikriti: {
        dominant: 'Balanced',
        severity: 'Balanced',
        symptomScores: { vata: 0, pitta: 0, kapha: 0 },
        symptoms: [],
        imbalanceFlag: false
      },
      primaryDosha: dosha,
      result: dosha,
      submittedAt: new Date().toISOString()
    };
    return this.getRoutineForAssessment(fallbackAssessment);
  }

  createNotification(
    userId: string,
    type: AppNotification['type'],
    title: string,
    message: string,
    channels: AppNotification['channels'],
    options?: NotificationDeliveryOptions
  ): AppNotification | null {
    const preference = this.getNotificationPreference(userId);
    const inferredScore = this.inferNotificationValueScore(type, title, message);
    const valueScore = Math.max(0, Math.min(100, Math.round(options?.valueScore ?? inferredScore)));
    const contextKey = this.resolveNotificationContextKey(type, title, message, options?.contextKey);

    if (!options?.force) {
      const policy = this.getNotificationPolicy(preference.frequency);
      if (valueScore < policy.minValueScore) return null;

      const now = Date.now();
      const userNotifications = this.notifications
        .filter((n) => n.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const recentByContext = userNotifications.find((n) => n.contextKey === contextKey);
      if (recentByContext) {
        const age = now - new Date(recentByContext.createdAt).getTime();
        if (age < policy.contextDedupeMs) return null;
      }
      const recentByType = userNotifications.find((n) => n.type === type);
      if (recentByType) {
        const age = now - new Date(recentByType.createdAt).getTime();
        if (age < policy.typeCooldownMs && valueScore < 92) return null;
      }
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const deliveredToday = userNotifications.filter((n) => new Date(n.createdAt).getTime() >= dayStart.getTime()).length;
      if (deliveredToday >= policy.maxPerDay && valueScore < 95) return null;
    }

    const item: AppNotification = {
      id: `notif_${Date.now()}`,
      userId,
      type,
      title,
      message,
      channels,
      valueScore,
      contextKey,
      seen: false,
      createdAt: new Date().toISOString()
    };
    this.notifications.push(item);
    this.persistAll();
    return item;
  }

  getNotifications(userId: string): AppNotification[] {
    return this.notifications
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  markNotificationSeen(id: string): void {
    const n = this.notifications.find((x) => x.id === id);
    if (!n) return;
    n.seen = true;
    this.persistAll();
  }

  getNotificationPreference(userId: string): NotificationPreference {
    const key = `${this.NOTIFICATION_PREF_KEY_PREFIX}${String(userId || '').trim()}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { frequency: 'balanced' };
      const parsed = JSON.parse(raw) as NotificationPreference;
      const frequency = parsed?.frequency;
      if (frequency === 'realtime' || frequency === 'balanced' || frequency === 'minimal') {
        return { frequency };
      }
      return { frequency: 'balanced' };
    } catch {
      return { frequency: 'balanced' };
    }
  }

  setNotificationPreference(userId: string, preference: NotificationPreference): void {
    const key = `${this.NOTIFICATION_PREF_KEY_PREFIX}${String(userId || '').trim()}`;
    const safe: NotificationPreference = {
      frequency:
        preference?.frequency === 'realtime' || preference?.frequency === 'minimal'
          ? preference.frequency
          : 'balanced'
    };
    try {
      localStorage.setItem(key, JSON.stringify(safe));
    } catch {
      // noop
    }
  }

  private getNotificationPolicy(frequency: NotificationFrequency): {
    minValueScore: number;
    typeCooldownMs: number;
    contextDedupeMs: number;
    maxPerDay: number;
  } {
    if (frequency === 'realtime') {
      return {
        minValueScore: 50,
        typeCooldownMs: 30 * 60 * 1000,
        contextDedupeMs: 8 * 60 * 60 * 1000,
        maxPerDay: 8
      };
    }
    if (frequency === 'minimal') {
      return {
        minValueScore: 80,
        typeCooldownMs: 12 * 60 * 60 * 1000,
        contextDedupeMs: 24 * 60 * 60 * 1000,
        maxPerDay: 2
      };
    }
    return {
      minValueScore: 65,
      typeCooldownMs: 3 * 60 * 60 * 1000,
      contextDedupeMs: 14 * 60 * 60 * 1000,
      maxPerDay: 4
    };
  }

  private inferNotificationValueScore(type: AppNotification['type'], title: string, message: string): number {
    const baseByType: Record<AppNotification['type'], number> = {
      appointment: 78,
      medicine: 85,
      therapy: 72,
      diet: 56,
      routine: 54,
      general: 58
    };
    const text = `${String(title || '')} ${String(message || '')}`.toLowerCase();
    let score = baseByType[type] || 55;

    const highValueSignals = [
      'urgent',
      'severe',
      'high imbalance',
      'follow-up',
      'rebook',
      'refill',
      'consultation',
      'doctor',
      'prescription',
      'today',
      'tomorrow',
      'due'
    ];
    const lowValueSignals = ['tip', 'explore', 'browse', 'newsletter', 'learn more', 'discover'];

    if (highValueSignals.some((token) => text.includes(token))) score += 12;
    if (text.includes('cancelled') || text.includes('completed') || text.includes('booked')) score += 10;
    if (text.includes('dosha') && text.includes('reassess')) score += 8;
    if (lowValueSignals.some((token) => text.includes(token))) score -= 18;
    return Math.max(0, Math.min(100, score));
  }

  private resolveNotificationContextKey(
    type: AppNotification['type'],
    title: string,
    message: string,
    explicit?: string
  ): string {
    if (explicit && explicit.trim()) return explicit.trim().toLowerCase().slice(0, 120);
    const normalizedTitle = String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .slice(0, 48);
    const normalizedMsg = String(message || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 8)
      .join(' ')
      .slice(0, 60);
    return `${type}:${normalizedTitle}:${normalizedMsg}`;
  }

  private normalizeConsultation(record: ConsultationRecord): ConsultationRecord {
    const startedAt = record.startedAt || record.startTime || new Date().toISOString();
    const sessionId = record.sessionId || record.id;
    const modeUsed = record.modeUsed && record.modeUsed.length > 0
      ? [...record.modeUsed]
      : [record.activeMode || 'chat'];
    const modeHistory = (record.modeHistory || []).length > 0
      ? [...record.modeHistory].sort((a, b) => a.switchedAt.localeCompare(b.switchedAt))
      : [{ mode: record.activeMode || 'chat', switchedAt: startedAt }];
    const messages = [...(record.messages || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const files = [...(record.files || [])].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));

    return {
      ...record,
      sessionId,
      startedAt,
      startTime: record.startTime || startedAt,
      modeUsed,
      modeHistory,
      messages,
      files,
      status: record.status || 'active',
      activeMode: record.activeMode || 'chat',
      encryption: record.encryption || 'session-encrypted',
      participantsJoined: record.participantsJoined || { patient: true, doctor: false },
      readOnlyAfterClose: record.readOnlyAfterClose || record.status === 'completed',
      lastHeartbeatAt: record.lastHeartbeatAt || startedAt
    };
  }

  private hasConsultationTimedOut(record: ConsultationRecord): boolean {
    if (record.status !== 'active') return false;
    const base = record.lastHeartbeatAt || record.startedAt;
    const lastMs = new Date(base).getTime();
    const nowMs = Date.now();
    const idleMs = nowMs - lastMs;
    const totalMs = nowMs - new Date(record.startedAt).getTime();
    return idleMs > 25 * 60 * 1000 || totalMs > 90 * 60 * 1000;
  }

  private generateConsultationSummary(record: ConsultationRecord): string {
    const userMessages = (record.messages || [])
      .filter((m) => m.sender === 'patient' || m.sender === 'doctor')
      .slice(-3)
      .map((m) => m.text.trim())
      .filter((t) => !!t);
    if (userMessages.length === 0) return 'Consultation completed with guidance documented in chat history.';
    return `Discussion highlights: ${userMessages.join(' | ')}`.slice(0, 280);
  }

  answerAyurvedaQuery(question: string): { reply: string; riskLevel: 'low' | 'moderate' | 'high'; suggestDoctor: boolean } {
    const q = question.toLowerCase();
    const hasRedFlag =
      q.includes('chest pain') ||
      q.includes('blood') ||
      q.includes('faint') ||
      q.includes('suicidal') ||
      q.includes('severe');
    if (hasRedFlag) {
      return {
        reply:
          'Symptoms suggest possible acute risk. Ayurveda supports healing, but immediate physician consultation is required now. Keep body cool, avoid self-medication, and seek urgent care.',
        riskLevel: 'high',
        suggestDoctor: true
      };
    }

    if (q.includes('acidity') || q.includes('burning')) {
      return {
        reply:
          'This pattern can indicate Pitta aggravation. Prefer cooling meals (lauki, coriander, ghee in moderation), avoid fried and fermented foods, and maintain early dinners.',
        riskLevel: 'moderate',
        suggestDoctor: true
      };
    }

    if (q.includes('anxiety') || q.includes('sleep')) {
      return {
        reply:
          'This may reflect Vata imbalance. Keep regular sleep times, include warm unctuous meals, gentle abhyanga, and nadi shodhana before bed.',
        riskLevel: 'low',
        suggestDoctor: false
      };
    }

    if (q.includes('weight') || q.includes('sluggish')) {
      return {
        reply:
          'This can align with Kapha aggravation. Use light warm meals, daily brisk movement, avoid daytime sleep, and emphasize dry spices like trikatu under guidance.',
        riskLevel: 'low',
        suggestDoctor: false
      };
    }

    return {
      reply:
        'Share your main symptom, digestion pattern, appetite, and sleep quality. I will map likely dosha imbalance and suggest diet and lifestyle steps using Ayurvedic principles.',
      riskLevel: 'low',
      suggestDoctor: false
    };
  }

  answerPersonalizedAyurvedaQuery(
    userId: string,
    question: string
  ): {
    reply: string;
    riskLevel: 'low' | 'moderate' | 'high';
    suggestDoctor: boolean;
    contextUsed: string[];
    safetyNote: string;
  } {
    const base = this.answerAyurvedaQuery(question);
    const query = String(question || '').toLowerCase();
    const latestDosha = this.auth.getLatestDoshaAssessment(userId);
    const patient = this.auth.getPatientData(userId) as any;
    const consults = this.getConsultationsForPatient(userId).slice(0, 6);
    const prescriptions = this.getPrescriptionsForPatient(userId).slice(0, 4);
    const allergies: string[] = Array.isArray(patient?.allergies)
      ? patient.allergies.map((x: any) => String(x || '').trim()).filter(Boolean)
      : [];

    const prakriti = latestDosha?.prakriti?.primary || latestDosha?.primaryDosha || 'Vata';
    const vikriti = latestDosha?.vikriti?.dominant || 'Balanced';
    const symptomHints = (latestDosha?.vikriti?.symptoms || []).map((s) => s.label || s.key).filter(Boolean).slice(0, 3);
    const lastConsult = consults[0];
    const lastConsultDays = lastConsult
      ? Math.floor((Date.now() - new Date(lastConsult.startedAt).getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const hasActiveRx = prescriptions.some((p) => (p.status || 'active') === 'active');

    const contextUsed: string[] = [
      `Prakriti: ${prakriti}`,
      `Vikriti: ${vikriti}`,
      symptomHints.length ? `Symptoms: ${symptomHints.join(', ')}` : '',
      consults.length ? `Consultations: ${consults.length}` : '',
      hasActiveRx ? 'Active prescriptions: yes' : '',
      allergies.length ? `Allergies: ${allergies.slice(0, 2).join(', ')}` : ''
    ].filter(Boolean);

    const nonDiagnostic = 'This is supportive Ayurvedic guidance, not a medical diagnosis.';
    if (base.riskLevel === 'high') {
      return {
        reply: `${base.reply}\n\n${nonDiagnostic}`,
        riskLevel: 'high',
        suggestDoctor: true,
        contextUsed,
        safetyNote: 'Urgent symptoms require immediate medical evaluation.'
      };
    }

    let personalized = '';
    if (query.includes('diet') || query.includes('food') || query.includes('aahar')) {
      const diet = latestDosha
        ? this.generateDietPlan(userId, latestDosha)
        : this.generateDietPlan(userId, prakriti);
      const meal = diet.meals[0];
      const line = meal ? `${meal.name}: ${meal.items.slice(0, 2).join(', ')}` : 'Use warm freshly cooked meals at fixed times.';
      personalized = `Based on your ${prakriti} profile${vikriti !== 'Balanced' ? ` and ${vikriti} imbalance` : ''}, start with: ${line}`;
      if (allergies.length) personalized += ` Avoid foods linked to your allergies (${allergies.slice(0, 2).join(', ')}).`;
    } else if (query.includes('sleep') || query.includes('stress') || query.includes('routine')) {
      const routine = this.getPersonalizedRoutine({ assessment: latestDosha || this.buildFallbackAssessment(userId, prakriti) });
      const sleep = routine.routine.find((x) => x.block === 'Sleep');
      const windDown = routine.routine.find((x) => x.block === 'Evening wind-down');
      personalized = `For your ${prakriti}-${vikriti} pattern, keep ${windDown?.time || 'a calm wind-down'} and sleep around ${sleep?.time || '10:30 PM'}.`;
    } else if (query.includes('medicine') || query.includes('refill') || query.includes('dose')) {
      if (hasActiveRx) {
        const recentRx = prescriptions[0];
        personalized = `You have active treatment from your recent consultation${lastConsultDays !== null ? ` (${lastConsultDays} days ago)` : ''}. Follow prescribed timing exactly and review refill needs this week.`;
      } else {
        personalized = 'I cannot prescribe medicines here. If symptoms persist, book a consultation for a clinician-reviewed prescription.';
      }
    } else if (query.includes('follow up') || query.includes('follow-up') || query.includes('consult')) {
      if (lastConsultDays !== null) {
        personalized =
          lastConsultDays >= 14
            ? `It has been ${lastConsultDays} days since your last consultation. A follow-up now can refine your current care plan.`
            : `Your recent consultation was ${lastConsultDays} days ago. Track symptoms for a few more days, then schedule follow-up if not improving.`;
      } else {
        personalized = 'No consultation history found yet. Start with a consultation for tailored Ayurvedic planning.';
      }
    } else {
      personalized = `Given your ${prakriti} constitution${vikriti !== 'Balanced' ? ` with current ${vikriti} pattern` : ''}, focus on regular meals, stable sleep timing, and gentle daily movement first.`;
    }

    const reply = `${personalized}\n\n${nonDiagnostic}`;
    return {
      reply,
      riskLevel: base.riskLevel,
      suggestDoctor: base.suggestDoctor || query.includes('severe') || query.includes('persistent'),
      contextUsed,
      safetyNote: 'For severe, worsening, or persistent symptoms, consult a doctor directly.'
    };
  }

  private buildFallbackAssessment(userId: string, dosha: DoshaType): DoshaAssessmentRecord {
    return {
      id: `assistant_fallback_${userId}_${dosha}`,
      userId,
      source: 'self_assessed',
      assessmentDate: new Date().toISOString(),
      validTill: new Date().toISOString(),
      selfReported: true,
      answers: {},
      scores: { vata: dosha === 'Vata' ? 100 : 10, pitta: dosha === 'Pitta' ? 100 : 10, kapha: dosha === 'Kapha' ? 100 : 10 },
      prakriti: {
        primary: dosha,
        secondary: undefined,
        isDual: false,
        scores: { vata: 0, pitta: 0, kapha: 0 },
        percentages: { vata: dosha === 'Vata' ? 70 : 15, pitta: dosha === 'Pitta' ? 70 : 15, kapha: dosha === 'Kapha' ? 70 : 15 }
      },
      vikriti: {
        dominant: 'Balanced',
        severity: 'Balanced',
        symptomScores: { vata: 0, pitta: 0, kapha: 0 },
        symptoms: [],
        imbalanceFlag: false
      },
      primaryDosha: dosha,
      result: dosha,
      submittedAt: new Date().toISOString()
    };
  }

  private resolveRoutineBasis(assessment: DoshaAssessmentRecord): RoutineBasis {
    const prakritiPrimary = assessment.prakriti?.primary || assessment.primaryDosha || 'Vata';
    const prakritiSecondary = assessment.prakriti?.secondary || assessment.secondaryDosha;
    const vikritiDominant = assessment.vikriti?.dominant || 'Balanced';
    const vikritiSeverity = assessment.vikriti?.severity || 'Balanced';
    const equalDominance = this.hasEqualDominance(assessment.vikriti?.symptomScores);

    if (vikritiDominant !== 'Balanced' && !equalDominance) {
      return {
        priority: 'vikriti',
        pacifyDosha: vikritiDominant,
        line: `Based on your ${vikritiDominant} imbalance.`,
        prakritiPrimary,
        prakritiSecondary,
        vikritiDominant,
        vikritiSeverity
      };
    }

    return {
      priority: 'prakriti',
      pacifyDosha: prakritiPrimary,
      line:
        vikritiDominant === 'Balanced'
          ? `No dominant Vikriti detected. Maintenance routine aligned to ${prakritiPrimary} prakriti.`
          : `Equal dosha dominance in current symptoms. Routine anchored to ${prakritiPrimary} prakriti.`,
      prakritiPrimary,
      prakritiSecondary,
      vikritiDominant,
      vikritiSeverity
    };
  }

  private routineBlueprintByDosha(dosha: DoshaType, sleepSchedule: 'day' | 'night'): RoutineSuggestion[] {
    const dayScheduleByDosha: Record<DoshaType, Array<{ block: RoutineBlock; time: string; action: string; reason: string; yoga: string; pranayama: string; reminderType: RoutineSuggestion['reminderType'] }>> = {
      Vata: [
        { block: 'Wake-up', time: '6:00-6:30 AM', action: 'Wake gently and sip warm water.', reason: 'Regular and warm start stabilizes Vata variability.', yoga: 'Gentle neck and spine mobility', pranayama: 'Nadi Shodhana', reminderType: 'wake' },
        { block: 'Morning hygiene', time: '6:30-7:00 AM', action: 'Sesame oil abhyanga and tongue cleaning.', reason: 'Unctuous daily care reduces dryness and supports calmness.', yoga: 'Cat-Cow (slow)', pranayama: 'Bhramari', reminderType: 'seasonal' },
        { block: 'Exercise / Yoga', time: '7:00-7:30 AM', action: 'Slow grounding yoga and short walk.', reason: 'Moderate movement prevents overexertion and anxiety.', yoga: 'Vrikshasana, Balasana', pranayama: 'Ujjayi', reminderType: 'seasonal' },
        { block: 'Bathing', time: '7:30-8:00 AM', action: 'Warm bath after mild activity.', reason: 'Warmth supports circulation and reduces Vata coldness.', yoga: 'None', pranayama: 'None', reminderType: 'seasonal' },
        { block: 'Meals timing', time: '8:00 AM, 1:00 PM, 7:00 PM', action: 'Take warm cooked meals at fixed times.', reason: 'Meal regularity grounds Vata and supports agni.', yoga: 'Post-meal short walk', pranayama: 'None', reminderType: 'meal' },
        { block: 'Work / activity rhythm', time: '10:00 AM-5:30 PM', action: 'Work in focused blocks with short breaks.', reason: 'Pacing prevents nervous depletion and fatigue.', yoga: 'Desk stretches', pranayama: '3-minute Nadi Shodhana', reminderType: 'seasonal' },
        { block: 'Evening wind-down', time: '7:30-9:00 PM', action: 'Digital sunset, warm herbal drink, light reading.', reason: 'Calm evening routine improves Vata sleep quality.', yoga: 'Supine twist', pranayama: 'Bhramari', reminderType: 'seasonal' },
        { block: 'Sleep', time: '10:00-10:30 PM', action: 'Sleep before 10:30 PM in a quiet dark room.', reason: 'Early sleep is restorative for Vata instability.', yoga: 'None', pranayama: 'Left nostril breathing', reminderType: 'sleep' }
      ],
      Pitta: [
        { block: 'Wake-up', time: '5:45-6:15 AM', action: 'Wake early and hydrate with room-temperature water.', reason: 'Early calm start helps reduce Pitta heat and intensity.', yoga: 'Moon salutations (gentle)', pranayama: 'Sheetali', reminderType: 'wake' },
        { block: 'Morning hygiene', time: '6:15-6:45 AM', action: 'Coconut or sunflower oil self-massage (light).', reason: 'Cooling self-care helps soothe excess heat.', yoga: 'Shoulder opening', pranayama: 'Chandra Bhedana', reminderType: 'seasonal' },
        { block: 'Exercise / Yoga', time: '6:45-7:20 AM', action: 'Moderate yoga, avoid competitive intensity.', reason: 'Balanced effort prevents aggravation of sharp Pitta traits.', yoga: 'Shashankasana, Ardha Matsyendrasana', pranayama: 'Sheetkari', reminderType: 'seasonal' },
        { block: 'Bathing', time: '7:20-7:45 AM', action: 'Lukewarm bath, avoid very hot water.', reason: 'Cooling routine regulates Pitta reactivity.', yoga: 'None', pranayama: 'None', reminderType: 'seasonal' },
        { block: 'Meals timing', time: '8:00 AM, 12:30 PM, 7:00 PM', action: 'Never skip lunch; keep spices moderate.', reason: 'Predictable meals prevent acid and irritability spikes.', yoga: 'Post-lunch 10-minute walk', pranayama: 'None', reminderType: 'meal' },
        { block: 'Work / activity rhythm', time: '9:30 AM-5:30 PM', action: 'Take cooling micro-breaks and avoid heated debates when hungry.', reason: 'Pauses reduce Pitta-driven overdrive and burnout.', yoga: 'Chest opener at desk', pranayama: '2-minute cooling breath', reminderType: 'seasonal' },
        { block: 'Evening wind-down', time: '7:30-9:30 PM', action: 'Light walk at sunset and calm activities.', reason: 'Evening cooling prevents late-night Pitta activation.', yoga: 'Forward bends (gentle)', pranayama: 'Chandra Bhedana', reminderType: 'seasonal' },
        { block: 'Sleep', time: '10:30 PM', action: 'Sleep by 10:30 PM.', reason: 'Timely sleep helps manage nighttime heat and mental overactivity.', yoga: 'None', pranayama: 'Bhramari', reminderType: 'sleep' }
      ],
      Kapha: [
        { block: 'Wake-up', time: '5:30-6:00 AM', action: 'Wake before sunrise and drink warm ginger water.', reason: 'Early stimulation counters Kapha heaviness.', yoga: 'Dynamic stretches', pranayama: 'Kapalabhati', reminderType: 'wake' },
        { block: 'Morning hygiene', time: '6:00-6:30 AM', action: 'Dry brushing and brisk self-massage.', reason: 'Ruksha stimulation mobilizes stagnant Kapha.', yoga: 'Standing twists', pranayama: 'Bhastrika (mild)', reminderType: 'seasonal' },
        { block: 'Exercise / Yoga', time: '6:30-7:15 AM', action: 'Brisk walk or active yoga.', reason: 'Daily intensity reduces sluggishness and supports metabolism.', yoga: 'Surya Namaskar, Trikonasana', pranayama: 'Kapalabhati', reminderType: 'seasonal' },
        { block: 'Bathing', time: '7:15-7:40 AM', action: 'Warm bath after exercise.', reason: 'Heat and activity keep Kapha from accumulating.', yoga: 'None', pranayama: 'None', reminderType: 'seasonal' },
        { block: 'Meals timing', time: '8:00 AM (light), 1:00 PM, 7:00 PM (light)', action: 'Keep breakfast light and dinner early.', reason: 'Light meal rhythm prevents Kapha congestion.', yoga: 'Post-meal short walk', pranayama: 'None', reminderType: 'meal' },
        { block: 'Work / activity rhythm', time: '9:00 AM-6:00 PM', action: 'Avoid prolonged sitting; move every hour.', reason: 'Frequent movement prevents Kapha inertia.', yoga: 'Chair squats / brisk stairs', pranayama: 'Quick energizing breaths', reminderType: 'seasonal' },
        { block: 'Evening wind-down', time: '7:30-9:30 PM', action: 'Keep evening active but light.', reason: 'Too much inactivity at night increases Kapha lethargy.', yoga: 'Light mobility sequence', pranayama: 'Bhastrika (gentle)', reminderType: 'seasonal' },
        { block: 'Sleep', time: '10:00-10:30 PM', action: 'Sleep by 10:30 PM; avoid daytime naps.', reason: 'Disciplined sleep timing prevents excess Kapha accumulation.', yoga: 'None', pranayama: 'Nadi Shodhana', reminderType: 'sleep' }
      ]
    };

    const dayPlan = dayScheduleByDosha[dosha];
    const shifted = sleepSchedule === 'night' ? this.shiftToNightSchedule(dayPlan) : dayPlan;
    return shifted.map((item, idx) => ({
      id: `routine_${dosha.toLowerCase()}_${idx + 1}`,
      block: item.block,
      title: item.block,
      time: item.time,
      details: item.action,
      actions: [item.action],
      reason: item.reason,
      recommendationType: 'recommended',
      reminderType: item.reminderType,
      reminderLabel: `${item.block} reminder`,
      yoga: item.yoga,
      pranayama: item.pranayama
    }));
  }

  private shiftToNightSchedule(
    items: Array<{ block: RoutineBlock; time: string; action: string; reason: string; yoga: string; pranayama: string; reminderType: RoutineSuggestion['reminderType'] }>
  ): Array<{ block: RoutineBlock; time: string; action: string; reason: string; yoga: string; pranayama: string; reminderType: RoutineSuggestion['reminderType'] }> {
    const byBlock: Record<RoutineBlock, string> = {
      'Wake-up': '1:30-2:00 PM',
      'Morning hygiene': '2:00-2:30 PM',
      'Exercise / Yoga': '2:30-3:15 PM',
      Bathing: '3:15-3:40 PM',
      'Meals timing': '3:45 PM, 9:00 PM, 1:00 AM',
      'Work / activity rhythm': '4:00 PM-12:00 AM',
      'Evening wind-down': '12:00-1:00 AM',
      Sleep: '6:00-7:00 AM'
    };
    return items.map((item) => ({
      ...item,
      time: byBlock[item.block]
    }));
  }

  private compactRoutineItems(items: RoutineSuggestion[], lifestyle: LifestyleProfile, seedSource: string): RoutineSuggestion[] {
    const blockMap = new Map<RoutineSuggestion['block'], RoutineSuggestion>();
    items.forEach((item) => {
      if (!blockMap.has(item.block)) blockMap.set(item.block, item);
    });

    const anchors: RoutineSuggestion['block'][] = ['Wake-up', 'Meals timing', 'Evening wind-down', 'Sleep'];
    const adaptive: RoutineSuggestion['block'][] = [];
    if ((lifestyle.activityLevel || 'moderate') === 'low') adaptive.push('Exercise / Yoga');
    if ((lifestyle.workRhythm || 'desk') !== 'active') adaptive.push('Work / activity rhythm');
    if ((lifestyle.stressLevel || 'moderate') === 'high') adaptive.push('Morning hygiene');

    const selectedBlocks = [...new Set([...anchors, ...adaptive])].slice(0, 5);
    const selected = selectedBlocks
      .map((block) => blockMap.get(block))
      .filter((x): x is RoutineSuggestion => !!x);

    if (selected.length < 3) {
      const fallback = items.filter((item) => !selected.some((s) => s.id === item.id)).slice(0, 3 - selected.length);
      selected.push(...fallback);
    }

    const daySeed = this.hashToNumber(seedSource);
    const rotated = selected
      .map((item, idx) => ({ item, score: (daySeed + idx * 7) % 100 }))
      .sort((a, b) => a.score - b.score)
      .map((row) => row.item);

    return rotated.map((item, idx) => ({
      ...item,
      id: `${item.id}_daily_${idx + 1}`,
      details: this.toActionLine(item.details || item.actions?.[0] || item.title),
      actions: [],
      yoga: '',
      pranayama: '',
      reason: item.reason ? this.toActionLine(item.reason, 80) : item.reason
    }));
  }

  private toActionLine(value: string, max = 110): string {
    const compact = String(value || '').replace(/\s+/g, ' ').trim();
    if (!compact) return '';
    if (compact.length <= max) return compact;
    return `${compact.slice(0, max - 1).trimEnd()}.`;
  }

  private hashToNumber(value: string): number {
    let hash = 0;
    const src = String(value || '');
    for (let i = 0; i < src.length; i += 1) {
      hash = (hash * 31 + src.charCodeAt(i)) % 2147483647;
    }
    return Math.abs(hash);
  }

  private applyRoutineSeasonalAdjustment(
    items: RoutineSuggestion[],
    season: DietSeason,
    dosha: DoshaType,
    climateZone: ClimateZone = 'unknown'
  ): RoutineSuggestion[] {
    const seasonalRuleBySeason: Record<DietSeason, Partial<Record<RoutineBlock, { addAction: string; reason: string }>>> = {
      vasanta: {
        'Exercise / Yoga': {
          addAction: 'Add dry and energizing movement to reduce spring Kapha accumulation.',
          reason: 'Spring often increases heaviness and mucus tendencies.'
        }
      },
      grishma: {
        'Exercise / Yoga': {
          addAction: 'Keep exercise mild and avoid midday exertion.',
          reason: 'Summer heat can quickly aggravate Pitta.'
        },
        'Meals timing': {
          addAction: 'Hydrate with cooling herbal water between meals.',
          reason: 'Heat and dehydration increase irritability and fatigue.'
        }
      },
      varsha: {
        'Morning hygiene': {
          addAction: 'Prioritize dry hygiene and keep body warm/dry after bathing.',
          reason: 'Monsoon dampness weakens digestion and increases ama risk.'
        },
        'Meals timing': {
          addAction: 'Favor warm, freshly cooked meals and avoid raw foods.',
          reason: 'Digestive fire is variable during monsoon.'
        }
      },
      sharada: {
        'Evening wind-down': {
          addAction: 'Include calming cooling breathwork at sunset.',
          reason: 'Post-monsoon heat can elevate residual Pitta.'
        }
      },
      hemanta: {
        'Morning hygiene': {
          addAction: 'Use warm oil massage before bath.',
          reason: 'Winter dryness and cold need snigdha and ushna support.'
        }
      },
      shishira: {
        'Morning hygiene': {
          addAction: 'Apply warming oil and protect from cold wind.',
          reason: 'Late winter increases Vata dryness and stiffness.'
        }
      }
    };

    const rules = seasonalRuleBySeason[season];
    const adjusted = items.map((item) => {
      const rule = rules[item.block];
      if (!rule) return item;
      const seasonalPrefix = dosha === 'Pitta' && season === 'grishma' ? 'Cooling seasonal adjustment' : 'Seasonal adjustment';
      return {
        ...item,
        actions: this.uniqueItems([...(item.actions || [item.details]), rule.addAction]),
        details: `${item.details} ${rule.addAction}`,
        reason: `${item.reason || ''} ${seasonalPrefix}: ${rule.reason}`.trim(),
        reminderType: item.reminderType || 'seasonal'
      };
    });
    if (climateZone === 'unknown') return adjusted;

    return adjusted.map((item) => {
      if (climateZone === 'humid' || climateZone === 'coastal') {
        if (item.block === 'Meals timing') {
          return {
            ...item,
            actions: this.uniqueItems([...(item.actions || [item.details]), 'Keep dinner light and warm in humid weather.']),
            reason: `${item.reason || ''} Climate adjustment: humid weather can aggravate Kapha-like heaviness.`.trim()
          };
        }
      }
      if (climateZone === 'arid' || climateZone === 'cold') {
        if (item.block === 'Wake-up' || item.block === 'Morning hygiene') {
          return {
            ...item,
            actions: this.uniqueItems([...(item.actions || [item.details]), 'Use warm fluids and gentle oiling to reduce dryness.']),
            reason: `${item.reason || ''} Climate adjustment: dry/cold weather can increase Vata dryness.`.trim()
          };
        }
      }
      if (climateZone === 'tropical' && item.block === 'Wake-up') {
        return {
          ...item,
          actions: this.uniqueItems([...(item.actions || [item.details]), 'Increase daytime hydration and avoid peak-heat exertion.']),
          reason: `${item.reason || ''} Climate adjustment: tropical heat may elevate Pitta.`.trim()
        };
      }
      return item;
    });
  }

  private normalizeDietInput(
    patientIdOrInput: string | GenerateDietInput,
    assessmentOrDosha?: DoshaAssessmentRecord | DoshaType
  ): GenerateDietInput {
    if (typeof patientIdOrInput !== 'string') {
      return {
        ...patientIdOrInput,
        season: patientIdOrInput.season || this.resolveSeason(patientIdOrInput.location),
        foodAllergies: patientIdOrInput.foodAllergies || []
      };
    }

    const patientId = patientIdOrInput;
    const patientLocation = this.resolvePatientLocation(patientId);
    if (assessmentOrDosha && typeof assessmentOrDosha !== 'string') {
      return {
        patientId,
        assessment: assessmentOrDosha,
        season: this.resolveSeason(patientLocation),
        location: patientLocation,
        foodAllergies: []
      };
    }

    const dosha = (assessmentOrDosha as DoshaType) || 'Vata';
    return {
      patientId,
      assessment: {
        id: `legacy_assessment_${patientId}`,
        userId: patientId,
        source: 'self_assessed',
        assessmentDate: new Date().toISOString(),
        validTill: new Date().toISOString(),
        selfReported: true,
        answers: {},
        scores: { vata: 0, pitta: 0, kapha: 0 },
        prakriti: {
          primary: dosha,
          isDual: false,
          scores: { vata: 0, pitta: 0, kapha: 0 },
          percentages: { vata: 0, pitta: 0, kapha: 0 }
        },
        vikriti: {
          dominant: 'Balanced',
          severity: 'Balanced',
          symptomScores: { vata: 0, pitta: 0, kapha: 0 },
          symptoms: [],
          imbalanceFlag: false
        },
        primaryDosha: dosha,
        result: dosha,
        submittedAt: new Date().toISOString()
      },
      season: this.resolveSeason(patientLocation),
      location: patientLocation,
      foodAllergies: []
    };
  }

  private buildDietPlan(input: GenerateDietInput): DietPlanRecord {
    const season = input.season || this.resolveSeason(input.location);
    const climateZone = this.inferClimateZone(input.location);
    const basis = this.resolveDietBasis(input.assessment);
    const seasonal = this.resolveSeasonalAdjustment(season, climateZone);
    const allergies = this.normalizeAllergies(input.foodAllergies || []);
    const meals = this.buildMeals(basis.pacifyDosha, season, seasonal, allergies);
    const avoid = this.buildAvoidList(basis.pacifyDosha, seasonal, allergies);
    const tips = this.resolveTips(basis, season, input.dietaryPreference, allergies, climateZone);

    return {
      id: `diet_${Date.now()}`,
      patientId: input.patientId,
      dosha: basis.pacifyDosha,
      season,
      assessmentId: input.assessment.id,
      basis: basis.basis,
      dietaryPreference: input.dietaryPreference,
      foodAllergies: allergies,
      meals,
      avoid,
      tips,
      doctorNotes: input.doctorRecommendations || [],
      generatedAt: new Date().toISOString()
    };
  }

  private buildFallbackDietPlan(input: GenerateDietInput): DietPlanRecord {
    const fallbackSeason = input.season || this.resolveSeason(input.location);
    const fallbackDosha = input.assessment?.prakriti?.primary || input.assessment?.primaryDosha || 'Vata';
    const basisLine = `Based on your ${fallbackDosha} prakriti maintenance needs.`;
    const climateZone = this.inferClimateZone(input.location);
    const seasonal = this.resolveSeasonalAdjustment(fallbackSeason, climateZone);
    const allergies = this.normalizeAllergies(input.foodAllergies || []);

    return {
      id: `diet_${Date.now()}`,
      patientId: input.patientId,
      dosha: fallbackDosha,
      season: fallbackSeason,
      assessmentId: input.assessment?.id,
      basis: {
        priority: 'prakriti',
        line: basisLine,
        prakritiPrimary: fallbackDosha,
        prakritiSecondary: input.assessment?.prakriti?.secondary || input.assessment?.secondaryDosha,
        vikritiDominant: 'Balanced',
        vikritiSeverity: 'Balanced'
      },
      dietaryPreference: input.dietaryPreference,
      foodAllergies: allergies,
      meals: this.buildMeals(fallbackDosha, fallbackSeason, seasonal, allergies),
      avoid: this.buildAvoidList(fallbackDosha, seasonal, allergies),
      tips: [
        'Eat at regular times with freshly prepared Indian meals.',
        'Prefer warm food and avoid overeating at night.',
        'Consult your doctor if symptoms increase.'
      ],
      doctorNotes: input.doctorRecommendations || [],
      generatedAt: new Date().toISOString()
    };
  }

  private resolveDietBasis(assessment: DoshaAssessmentRecord): DietBasis {
    const prakritiPrimary = assessment.prakriti?.primary || assessment.primaryDosha || 'Vata';
    const prakritiSecondary = assessment.prakriti?.secondary || assessment.secondaryDosha;
    const vikritiDominant = assessment.vikriti?.dominant || assessment.vikritiLabel || 'Balanced';
    const vikritiSeverity = assessment.vikriti?.severity || (vikritiDominant === 'Balanced' ? 'Balanced' : 'Low');
    const equalDominance = this.hasEqualDominance(assessment.vikriti?.symptomScores);

    if (vikritiDominant !== 'Balanced' && !equalDominance) {
      return {
        pacifyDosha: vikritiDominant,
        equalDominance: false,
        basis: {
          priority: 'vikriti',
          line: `Based on your ${vikritiDominant} imbalance`,
          prakritiPrimary,
          prakritiSecondary,
          vikritiDominant,
          vikritiSeverity
        }
      };
    }

    if (vikritiDominant !== 'Balanced' && equalDominance) {
      return {
        pacifyDosha: prakritiPrimary,
        equalDominance: true,
        basis: {
          priority: 'prakriti',
          line: `Your symptom profile shows equal dosha dominance, so this plan supports ${prakritiPrimary} prakriti maintenance.`,
          prakritiPrimary,
          prakritiSecondary,
          vikritiDominant,
          vikritiSeverity
        }
      };
    }

    return {
      pacifyDosha: prakritiPrimary,
      equalDominance: false,
      basis: {
        priority: 'prakriti',
        line: `No major Vikriti detected. This is a maintenance plan for your ${prakritiPrimary} prakriti.`,
        prakritiPrimary,
        prakritiSecondary,
        vikritiDominant: 'Balanced',
        vikritiSeverity: 'Balanced'
      }
    };
  }

  private hasEqualDominance(scores?: { vata: number; pitta: number; kapha: number }): boolean {
    if (!scores) return false;
    const values = [scores.vata || 0, scores.pitta || 0, scores.kapha || 0];
    const max = Math.max(...values);
    if (max <= 0) return false;
    return values.filter((v) => v === max).length > 1;
  }

  private resolveSeason(location?: string): DietSeason {
    if (location) {
      const lowered = String(location).toLowerCase();
      const southernMarkers = ['australia', 'new zealand', 'argentina', 'chile', 'south africa', 'uruguay'];
      const isSouthernHemisphere = southernMarkers.some((marker) => lowered.includes(marker));
      if (isSouthernHemisphere) {
        const month = new Date().getMonth() + 1;
        const shiftedMonth = ((month + 5) % 12) + 1;
        return this.mapMonthToSeason(shiftedMonth);
      }
    }
    return this.mapMonthToSeason(new Date().getMonth() + 1);
  }

  private mapMonthToSeason(month: number): DietSeason {
    if (month >= 3 && month <= 4) return 'vasanta';
    if (month >= 5 && month <= 6) return 'grishma';
    if (month >= 7 && month <= 8) return 'varsha';
    if (month >= 9 && month <= 10) return 'sharada';
    if (month >= 11 && month <= 12) return 'hemanta';
    return 'shishira';
  }

  private resolveSeasonalAdjustment(season: DietSeason, climateZone: ClimateZone = 'unknown'): SeasonalAdjustment {
    if (season === 'grishma') {
      return {
        note: 'Summer season favors cooling and hydrating meals.',
        recommended: {
          'Early Morning': ['Coriander infused water'],
          Breakfast: ['Coconut-coriander poha'],
          Lunch: ['Lauki-moong stew with rice'],
          'Evening Snack': ['Sweet pomegranate bowl'],
          Dinner: ['Tori (ridge gourd) soup']
        },
        avoid: {
          Lunch: ['Very spicy gravies'],
          Dinner: ['Deep-fried snacks']
        },
        globalAvoid: ['Excess chili and sour fried foods in summer']
      };
    }
    if (season === 'varsha') {
      return {
        note: 'Monsoon season needs digestive-strengthening and light warm food.',
        recommended: {
          'Early Morning': ['Dry ginger and ajwain warm water'],
          Breakfast: ['Steamed idli with ginger-coconut chutney'],
          Lunch: ['Old rice with moong soup and jeera'],
          'Evening Snack': ['Roasted chana with dry ginger tea'],
          Dinner: ['Moong khichdi with black pepper']
        },
        avoid: {
          Breakfast: ['Cut raw salads'],
          Lunch: ['Heavy curd preparations']
        },
        globalAvoid: ['Raw, stale, and difficult-to-digest foods during monsoon']
      };
    }
    if (season === 'hemanta' || season === 'shishira') {
      return {
        note: 'Winter season supports warm, nourishing and agni-supportive meals.',
        recommended: {
          'Early Morning': ['Warm water with a little ghee'],
          Breakfast: ['Vegetable dalia with mild spices'],
          Lunch: ['Wheat phulka with sesame-seasoned vegetables'],
          'Evening Snack': ['Roasted makhana with ghee'],
          Dinner: ['Vegetable soup with soft khichdi']
        },
        avoid: {
          'Early Morning': ['Cold juices'],
          Dinner: ['Refrigerated leftovers']
        },
        globalAvoid: ['Cold and dry foods in winter evenings']
      };
    }
    const base: SeasonalAdjustment = {
      note: 'Seasonal adjustment is applied gently without changing dosha priority.',
      recommended: {},
      avoid: {},
      globalAvoid: []
    };
    if (climateZone === 'humid' || climateZone === 'coastal') {
      return {
        ...base,
        note: `${base.note} Humid climate support: keep meals lighter and warm.`,
        recommended: { Dinner: ['Clear vegetable soup with mild spices'] },
        avoid: { Dinner: ['Heavy dairy-rich dinners'] },
        globalAvoid: ['Excess cold and heavy foods in humid conditions']
      };
    }
    if (climateZone === 'arid' || climateZone === 'cold') {
      return {
        ...base,
        note: `${base.note} Dry/cold climate support: include warm fluids and unctuous foods.`,
        recommended: { 'Early Morning': ['Warm water with a little ghee'] },
        avoid: { 'Early Morning': ['Very cold drinks'] },
        globalAvoid: ['Skipping hydration in dry or cold climates']
      };
    }
    if (climateZone === 'tropical') {
      return {
        ...base,
        note: `${base.note} Tropical climate support: prioritize cooling hydration.`,
        recommended: { 'Evening Snack': ['Pomegranate or tender coconut water'] },
        avoid: { Lunch: ['Very spicy gravies'] },
        globalAvoid: ['Excessively heating foods in peak daytime']
      };
    }
    return base;
  }

  private mealBlueprints(dosha: DoshaType): Record<MealSlot, DietMealBlueprint> {
    if (dosha === 'Vata') {
      return {
        'Early Morning': {
          recommended: ['Warm water with soaked raisins', 'Ginger-fennel infusion', '2 soaked almonds with dates'],
          avoid: ['Cold smoothies', 'Skipping hydration in the morning'],
          explanation: 'Warm and slightly unctuous choices calm dry and mobile Vata qualities.'
        },
        Breakfast: {
          recommended: ['Moong dal chilla with ghee', 'Vegetable dalia', 'Soft idli with warm sambar'],
          avoid: ['Dry cornflakes', 'Cold fruit bowl'],
          explanation: 'Cooked breakfast supports stable energy and reduces Vata variability.'
        },
        Lunch: {
          recommended: ['Moong khichdi with ghee', 'Wheat phulka with lauki sabzi', 'Jeera takra at room temperature'],
          avoid: ['Raw salad-only lunch', 'Skipping lunch'],
          explanation: 'Grounding lunch with warm grains and ghee pacifies Vata first.'
        },
        'Evening Snack': {
          recommended: ['Roasted makhana with ghee', 'Warm sweet potato chaat', 'Tulsi-fennel tea'],
          avoid: ['Cold sandwiches', 'Dry packaged namkeen'],
          explanation: 'Light warm snacks prevent evening Vata aggravation.'
        },
        Dinner: {
          recommended: ['Soft vegetable khichdi', 'Carrot-beet soup with ghee', 'Moong dal soup with rice'],
          avoid: ['Late-night dry snacks', 'Cold curd at night'],
          explanation: 'Early, warm and soft dinner improves sleep and digestion in Vata states.'
        }
      };
    }

    if (dosha === 'Pitta') {
      return {
        'Early Morning': {
          recommended: ['Room-temperature coriander water', 'Soaked munakka (raisins)', 'Fresh coconut water'],
          avoid: ['Empty stomach black coffee', 'Lemon-chili shots'],
          explanation: 'Cooling and mildly sweet choices reduce internal heat.'
        },
        Breakfast: {
          recommended: ['Coconut-coriander poha', 'Rice kanji with small ghee', 'Sweet ripe pear or papaya'],
          avoid: ['Spicy paratha', 'Fermented spicy breakfast'],
          explanation: 'Non-spicy breakfast helps settle sharp Pitta appetite safely.'
        },
        Lunch: {
          recommended: ['Rice with lauki-mung dal', 'Wheat phulka with tori sabzi', 'Cucumber-mint raita'],
          avoid: ['Very sour curries', 'Deep-fried lunch'],
          explanation: 'Midday cooling meals balance the natural peak of Pitta.'
        },
        'Evening Snack': {
          recommended: ['Pomegranate', 'Fennel tea', 'Roasted lotus seeds (plain)'],
          avoid: ['Chili bhujiya', 'Sour pickles'],
          explanation: 'Evening snacks should stay cooling and low in pungency.'
        },
        Dinner: {
          recommended: ['Moong soup with vegetables', 'Soft rice with bottle gourd', 'Chapati with pumpkin sabzi'],
          avoid: ['Fried spicy dinner', 'Tomato-heavy gravies'],
          explanation: 'Night meals should be light and cooling for Pitta pacification.'
        }
      };
    }

    return {
      'Early Morning': {
        recommended: ['Warm ginger water', 'Honey-lime in lukewarm water', 'Lightly spiced herbal tea'],
        avoid: ['Sweet milkshakes', 'Sleeping after sunrise'],
        explanation: 'Stimulating warm start reduces Kapha heaviness and stagnation.'
      },
      Breakfast: {
        recommended: ['Millet upma', 'Moong chilla', 'Steamed vegetables with pepper'],
        avoid: ['Sweet bakery items', 'Curd with sugar'],
        explanation: 'Light and warm breakfast helps mobilize sluggish Kapha.'
      },
      Lunch: {
        recommended: ['Barley khichdi', 'Jowar roti with mixed vegetables', 'Thin buttermilk with roasted cumin'],
        avoid: ['Heavy creamy gravies', 'Refined flour meals'],
        explanation: 'Dry-light grains and vegetables are ideal for Kapha balancing.'
      },
      'Evening Snack': {
        recommended: ['Roasted chana', 'Vegetable soup', 'Tulsi-ginger tea'],
        avoid: ['Fried pakoda', 'Sugar-rich tea biscuits'],
        explanation: 'Warm dry snacks prevent fluid and mucus buildup.'
      },
      Dinner: {
        recommended: ['Mixed vegetable soup', 'Sauteed greens with millet roti', 'Moong soup (light)'],
        avoid: ['Heavy sweets', 'Large dairy-rich dinner'],
        explanation: 'A light dinner is essential to avoid night-time Kapha accumulation.'
      }
    };
  }

  private buildMeals(
    dosha: DoshaType,
    season: DietSeason,
    seasonal: SeasonalAdjustment,
    allergies: string[]
  ): DietPlanRecord['meals'] {
    const order: MealSlot[] = ['Early Morning', 'Breakfast', 'Lunch', 'Evening Snack', 'Dinner'];
    const blueprints = this.mealBlueprints(dosha);

    return order.map((mealName) => {
      const blueprint = blueprints[mealName];
      const seasonalRecommended = seasonal.recommended[mealName] || [];
      const seasonalAvoid = seasonal.avoid[mealName] || [];

      const recommended = this.filterByAllergy(
        this.uniqueItems([...blueprint.recommended, ...seasonalRecommended]),
        allergies
      ).slice(0, 4);

      const filledRecommended =
        recommended.length >= 2 ? recommended : this.fillRecommended(dosha, recommended, allergies);

      const avoid = this.uniqueItems([...blueprint.avoid, ...seasonalAvoid]).slice(0, 3);
      const options = [
        ...filledRecommended.map((item) => ({
          item,
          recommendation: 'Recommended' as const,
          reason: blueprint.explanation
        })),
        ...avoid.map((item) => ({
          item,
          recommendation: 'Avoid' as const,
          reason: `Avoid for ${dosha} pacification.`
        }))
      ];

      return {
        name: mealName,
        items: filledRecommended,
        explanation: `${blueprint.explanation} ${seasonal.note}`.trim(),
        options
      };
    });
  }

  private buildAvoidList(dosha: DoshaType, seasonal: SeasonalAdjustment, allergies: string[]): string[] {
    const byDosha: Record<DoshaType, string[]> = {
      Vata: ['Cold, dry, and raw foods', 'Irregular meal timing', 'Dry packaged snacks'],
      Pitta: ['Fried, sour, and very spicy foods', 'Excess chili and vinegar', 'Overheated oily meals'],
      Kapha: ['Heavy, oily, and sweet foods', 'Excess dairy and sweets', 'Daytime overeating']
    };
    const allergyAvoid = allergies.map((item) => `Foods containing ${item}`);
    return this.uniqueItems([...byDosha[dosha], ...seasonal.globalAvoid, ...allergyAvoid]);
  }

  private resolveTips(
    basis: DietBasis,
    season: DietSeason,
    dietaryPreference: 'veg' | 'sattvic' | undefined,
    allergies: string[],
    climateZone: ClimateZone = 'unknown'
  ): string[] {
    const seasonTip =
      season === 'grishma'
        ? 'In summer, keep lunch cooling and hydrate through herbal waters.'
        : season === 'varsha'
          ? 'In monsoon, prefer warm freshly cooked meals and support digestion with ginger/jeera.'
          : season === 'hemanta' || season === 'shishira'
            ? 'In winter, use warm nourishing meals and avoid cold leftovers.'
            : 'Adjust food quantity to appetite and keep meal timings stable.';

    const tips: string[] = [
      basis.basis.line,
      seasonTip,
      'Eat freshly cooked Indian meals at regular timings and avoid late-night heavy dinner.'
    ];
    if (climateZone !== 'unknown') {
      tips.push(`Local climate adjustment: ${climateZone} conditions are factored into hydration and meal density.`);
    }

    if (dietaryPreference === 'sattvic') {
      tips.push('Sattvic preference applied: keep food simple, fresh, and mildly spiced.');
    }
    if (allergies.length > 0) {
      tips.push(`Allergy filter applied for: ${allergies.join(', ')}.`);
    }
    if (basis.basis.prakritiSecondary) {
      tips.push(`Secondary prakriti (${basis.basis.prakritiSecondary}) is used as a fine-tuning influence.`);
    }
    return tips;
  }

  resolveSeasonForContext(location?: string, explicitSeason?: DietSeason): DietSeason {
    return explicitSeason || this.resolveSeason(location);
  }

  private inferClimateZone(location?: string): ClimateZone {
    const value = String(location || '').trim().toLowerCase();
    if (!value) return 'unknown';

    const humidTokens = ['kerala', 'goa', 'mumbai', 'kolkata', 'chennai', 'bengal', 'assam', 'florida', 'singapore'];
    const aridTokens = ['rajasthan', 'dubai', 'abu dhabi', 'phoenix', 'nevada', 'arizona', 'jodhpur'];
    const coldTokens = ['himachal', 'kashmir', 'ladakh', 'sikkim', 'alaska', 'canada', 'norway', 'sweden'];
    const coastalTokens = ['coast', 'coastal', 'beach', 'port', 'bay', 'seaside'];
    const tropicalTokens = ['tropical', 'equator', 'sri lanka', 'indonesia', 'malaysia', 'thailand'];

    if (aridTokens.some((token) => value.includes(token))) return 'arid';
    if (coldTokens.some((token) => value.includes(token))) return 'cold';
    if (humidTokens.some((token) => value.includes(token))) return 'humid';
    if (coastalTokens.some((token) => value.includes(token))) return 'coastal';
    if (tropicalTokens.some((token) => value.includes(token))) return 'tropical';
    return 'temperate';
  }

  private resolvePatientLocation(patientId: string): string {
    try {
      const patient = this.auth.getPatientData(patientId) as any;
      return String(patient?.location || patient?.profile?.location || '').trim();
    } catch {
      return '';
    }
  }

  private fillRecommended(dosha: DoshaType, current: string[], allergies: string[]): string[] {
    const pantry: Record<DoshaType, string[]> = {
      Vata: ['Warm rice porridge', 'Moong dal soup', 'Wheat phulka with ghee', 'Stewed apple'],
      Pitta: ['Rice with moong dal', 'Bottle gourd sabzi', 'Coconut water', 'Sweet ripe pear'],
      Kapha: ['Barley soup', 'Millet khichdi', 'Roasted chana', 'Sauteed greens']
    };
    const filled = [...current];
    this.filterByAllergy(pantry[dosha], allergies).forEach((item) => {
      if (filled.length >= 2) return;
      if (!filled.includes(item)) filled.push(item);
    });
    return filled.slice(0, 4);
  }

  private normalizeAllergies(items: string[]): string[] {
    return this.uniqueItems(
      items
        .map((item) => item.trim().toLowerCase())
        .filter((item) => !!item)
    );
  }

  private filterByAllergy(items: string[], allergies: string[]): string[] {
    if (allergies.length === 0) return items;
    return items.filter((item) => !allergies.some((a) => item.toLowerCase().includes(a)));
  }

  private uniqueItems(items: string[]): string[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private normalizeTherapy(input: TherapyRecord): TherapyRecord {
    const id = input.id || input.therapyId || `therapy_${Date.now()}`;
    const pre = input.preTherapyGuidelines || input.preGuidance || [];
    const post = input.postTherapyCare || input.postGuidance || [];
    const primaryIndications = input.primaryIndications || input.eligibility || [];
    return {
      ...input,
      id,
      therapyId: input.therapyId || id,
      category: input.category || 'supportive',
      primaryIndications,
      doshaIndications: input.doshaIndications || {
        recommendedFor: ['Vata', 'Pitta', 'Kapha'],
        avoidFor: []
      },
      contraindications: input.contraindications || [],
      requiresDoctorApproval: input.requiresDoctorApproval !== false,
      preTherapyGuidelines: pre,
      postTherapyCare: post,
      duration: input.duration || '30-45 minutes',
      intensityLevel: input.intensityLevel || 'moderate',
      eligibility: primaryIndications,
      preGuidance: pre,
      postGuidance: post
    };
  }

  private normalizeTherapyRequest(input: TherapyBookingRequest): TherapyBookingRequest {
    const requestId = input.requestId || input.id || `therapy_req_${Date.now()}`;
    const therapy = this.getTherapyById(input.therapyId) || this.therapies[0];
    return {
      ...input,
      id: requestId,
      requestId,
      doctorId: input.doctorId || this.getDefaultDoctorId(),
      status: input.status === 'approved' || input.status === 'rejected' ? input.status : 'pending',
      eligibility: input.eligibility || this.checkTherapyEligibility(input.therapyId, null),
      preTherapyChecklist:
        input.preTherapyChecklist ||
        (therapy ? therapy.preTherapyGuidelines.map((item) => ({ item, acknowledged: false })) : []),
      postTherapyCare: input.postTherapyCare || (therapy ? [...therapy.postTherapyCare] : []),
      progressNotes: input.progressNotes || []
    };
  }

  private defaultDoctors(): DoctorProfile[] {
    return this.auth.getDoctors().map((doctor) => ({
      id: doctor.id,
      fullName: doctor.fullName,
      phone: doctor.phone,
      email: doctor.email || '',
      role: 'doctor',
      verified: true,
      degree: 'BAMS',
      specialization: ['General Ayurveda'],
      experienceYears: 1,
      rating: 4.5,
      reviewsCount: 0,
      bio: 'Verified Ayustura doctor profile.'
    }));
  }

  private defaultConsultations(): ConsultationRecord[] {
    return [];
  }

  private defaultHerbs(): HerbRecord[] {
    return [
      {
        id: 'herb_ashwagandha',
        name: 'Ashwagandha',
        category: 'herb',
        benefits: ['Supports stress resilience', 'Supports sleep quality'],
        dosage: '250-500 mg extract once or twice daily after meals under physician guidance.',
        precautions: ['Use cautiously in hyperthyroid states', 'Avoid self-use during pregnancy unless prescribed'],
        references: ['Charaka Samhita (Rasayana context)', 'Bhavaprakasha Nighantu'],
        editableBy: ['doctor', 'admin']
      },
      {
        id: 'med_triphala',
        name: 'Triphala Churna',
        category: 'classical-medicine',
        benefits: ['Supports bowel regularity', 'Gentle detox support'],
        dosage: '3-5 g at bedtime with warm water, personalized per agni.',
        precautions: ['Avoid long unsupervised use in depleted patients'],
        references: ['Ashtanga Hridaya', 'Sharangadhara Samhita'],
        editableBy: ['doctor', 'admin']
      }
    ];
  }

  private defaultTherapies(): TherapyRecord[] {
    const rows: TherapyRecord[] = [
      {
        id: 'therapy_vamana',
        name: 'Vamana',
        category: 'panchakarma',
        description: 'Therapeutic emesis protocol for Kapha-predominant aggravated conditions under strict supervision.',
        primaryIndications: ['Kapha aggravation', 'Respiratory congestion', 'Heaviness and lethargy'],
        doshaIndications: { recommendedFor: ['Kapha'], avoidFor: ['Vata'] },
        contraindications: ['Pregnancy', 'Severe debility', 'Uncontrolled hypertension'],
        requiresDoctorApproval: true,
        preTherapyGuidelines: ['Pre-procedure evaluation', 'Snehana and swedana as advised'],
        postTherapyCare: ['Samsarjana krama diet', 'Rest and avoid exertion'],
        duration: '3-5 day protocol',
        intensityLevel: 'high'
      },
      {
        id: 'therapy_virechana',
        name: 'Virechana',
        category: 'panchakarma',
        description: 'Controlled purgation protocol for Pitta imbalance under physician monitoring.',
        primaryIndications: ['Pitta aggravation', 'Skin flare tendencies', 'Amlapitta patterns'],
        doshaIndications: { recommendedFor: ['Pitta'], avoidFor: ['Vata'] },
        contraindications: ['Pregnancy', 'Severe dehydration', 'Acute fever'],
        requiresDoctorApproval: true,
        preTherapyGuidelines: ['Clinical review and fitness check', 'Follow preparatory oleation plan'],
        postTherapyCare: ['Graduated diet plan', 'Hydration and rest'],
        duration: '3-5 day protocol',
        intensityLevel: 'high'
      },
      {
        id: 'therapy_basti',
        name: 'Basti',
        category: 'panchakarma',
        description: 'Vata-balancing enema sequence delivered in supervised treatment schedule.',
        primaryIndications: ['Vata aggravation', 'Joint stiffness', 'Dry bowel patterns'],
        doshaIndications: { recommendedFor: ['Vata'], avoidFor: ['Kapha'] },
        contraindications: ['Pregnancy in sensitive stages', 'Acute diarrhea', 'Rectal bleeding'],
        requiresDoctorApproval: true,
        preTherapyGuidelines: ['Light meal as advised', 'Bowel history confirmation'],
        postTherapyCare: ['Warm meals', 'Avoid travel and cold exposure'],
        duration: '8-16 day course',
        intensityLevel: 'high'
      },
      {
        id: 'therapy_nasya',
        name: 'Nasya',
        category: 'panchakarma',
        description: 'Nasal administration protocol for head-neck channel cleansing and dosha support.',
        primaryIndications: ['Sinus congestion', 'Head heaviness', 'Vata-Kapha imbalance in head region'],
        doshaIndications: { recommendedFor: ['Vata', 'Kapha'], avoidFor: ['Pitta'] },
        contraindications: ['Acute sinus infection with fever', 'Post-meal immediate period'],
        requiresDoctorApproval: true,
        preTherapyGuidelines: ['Facial steam as advised', 'Empty stomach or light stomach state'],
        postTherapyCare: ['Avoid cold wind exposure', 'Warm water gargle and rest'],
        duration: '20-30 minutes/session',
        intensityLevel: 'moderate'
      },
      {
        id: 'therapy_raktamokshana',
        name: 'Raktamokshana',
        category: 'panchakarma',
        description: 'Specialized bloodletting therapy for selected Pitta-Rakta conditions under specialist care.',
        primaryIndications: ['Selected inflammatory conditions', 'Localized pitta-rakta aggravation'],
        doshaIndications: { recommendedFor: ['Pitta'], avoidFor: ['Vata'] },
        contraindications: ['Pregnancy', 'Anemia', 'Bleeding disorders'],
        requiresDoctorApproval: true,
        preTherapyGuidelines: ['Lab review and vitals clearance', 'Informed consent'],
        postTherapyCare: ['Rest and hydration', 'Follow physician diet guidance'],
        duration: '30-45 minutes/session',
        intensityLevel: 'high'
      },
      {
        id: 'therapy_abhyanga',
        name: 'Abhyanga',
        category: 'supportive',
        description: 'Warm medicated oil massage to nourish tissues and calm aggravated Vata.',
        primaryIndications: ['Dryness', 'Stress', 'Sleep disturbance', 'Vata aggravation'],
        doshaIndications: { recommendedFor: ['Vata'], avoidFor: ['Kapha'] },
        contraindications: ['Acute fever', 'Indigestion', 'Skin infection'],
        requiresDoctorApproval: false,
        preTherapyGuidelines: ['Avoid heavy meal before session', 'Inform therapist of pain areas'],
        postTherapyCare: ['Warm bath after advised interval', 'Avoid immediate cold exposure'],
        duration: '45-60 minutes',
        intensityLevel: 'low'
      },
      {
        id: 'therapy_shirodhara',
        name: 'Shirodhara',
        category: 'supportive',
        description: 'Steady stream therapy over forehead for calming mind and balancing Vata-Pitta.',
        primaryIndications: ['Stress reactivity', 'Insomnia tendency', 'Mental fatigue'],
        doshaIndications: { recommendedFor: ['Vata', 'Pitta'], avoidFor: ['Kapha'] },
        contraindications: ['Acute cold with congestion', 'Recent head injury'],
        requiresDoctorApproval: false,
        preTherapyGuidelines: ['Light meal and hydration', 'Remove scalp products before therapy'],
        postTherapyCare: ['Rest for 30 minutes', 'Avoid intense screen exposure immediately'],
        duration: '35-45 minutes',
        intensityLevel: 'moderate'
      },
      {
        id: 'therapy_swedana',
        name: 'Swedana',
        category: 'supportive',
        description: 'Therapeutic sudation to reduce stiffness and facilitate channel opening.',
        primaryIndications: ['Kapha stiffness', 'Muscular tightness', 'Ama-related heaviness'],
        doshaIndications: { recommendedFor: ['Vata', 'Kapha'], avoidFor: ['Pitta'] },
        contraindications: ['High Pitta heat signs', 'Dehydration', 'Pregnancy without doctor advice'],
        requiresDoctorApproval: false,
        preTherapyGuidelines: ['Hydrate adequately', 'Avoid fasting state'],
        postTherapyCare: ['Lukewarm fluids', 'Avoid cold foods and wind exposure'],
        duration: '20-30 minutes',
        intensityLevel: 'moderate'
      },
      {
        id: 'therapy_udvartana',
        name: 'Udvartana',
        category: 'supportive',
        description: 'Dry herbal powder massage for Kapha reduction and improved circulation.',
        primaryIndications: ['Kapha heaviness', 'Sluggish metabolism', 'Mild cellulite concerns'],
        doshaIndications: { recommendedFor: ['Kapha'], avoidFor: ['Vata'] },
        contraindications: ['Very dry sensitive skin', 'Active dermatitis'],
        requiresDoctorApproval: false,
        preTherapyGuidelines: ['Hydrate and avoid heavy meal', 'Report skin sensitivity'],
        postTherapyCare: ['Warm shower', 'Use light non-comedogenic moisturization if advised'],
        duration: '30-40 minutes',
        intensityLevel: 'moderate'
      },
      {
        id: 'therapy_pizhichil',
        name: 'Pizhichil',
        category: 'supportive',
        description: 'Warm oil squeezing therapy to reduce Vata pain and support neuromuscular relaxation.',
        primaryIndications: ['Vata-predominant pain', 'Stiffness', 'Fatigue recovery'],
        doshaIndications: { recommendedFor: ['Vata'], avoidFor: ['Kapha'] },
        contraindications: ['Acute fever', 'Active infection', 'Severe edema'],
        requiresDoctorApproval: false,
        preTherapyGuidelines: ['Light meal 2 hours prior', 'Discuss pressure tolerance'],
        postTherapyCare: ['Rest and warm hydration', 'Avoid strenuous activity for remainder of day'],
        duration: '45-60 minutes',
        intensityLevel: 'moderate'
      }
    ];
    return rows.map((row) => this.normalizeTherapy(row));
  }
}
