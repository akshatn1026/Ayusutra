import { DoshaType, ImbalanceSeverity, User } from '../services/auth.service';

export type ConsultationMode = 'chat' | 'audio' | 'video';
export type ConsultationStatus = 'pending' | 'active' | 'completed' | 'cancelled';
export type NotificationChannel = 'inApp' | 'email' | 'sms';
export type NotificationType = 'appointment' | 'medicine' | 'diet' | 'routine' | 'therapy' | 'general';

export interface DoctorProfile extends User {
  verified: boolean;
  degree: string;
  specialization: string[];
  experienceYears: number;
  rating: number;
  reviewsCount: number;
  bio: string;
}

export interface DoshaSnapshot {
  primary: DoshaType;
  secondary?: DoshaType;
  note: string;
}

export interface ChatMessage {
  id: string;
  sender: 'patient' | 'doctor' | 'assistant' | 'system';
  text: string;
  createdAt: string;
  deliveryStatus?: 'sent' | 'received';
  attachmentId?: string;
  severity?: 'low' | 'moderate' | 'high';
}

export interface ConsultationFile {
  id: string;
  name: string;
  sizeKb: number;
  mimeType: string;
  type?: 'report' | 'image' | 'other';
  uploadedBy: 'patient' | 'doctor';
  uploadedAt: string;
}

export interface ConsultationRecord {
  id: string;
  sessionId?: string;
  patientId: string;
  doctorId: string;
  startedAt: string;
  startTime?: string;
  endTime?: string;
  modeUsed?: ConsultationMode[];
  linkedAssessmentId?: string;
  appointmentId?: string;
  initiationType?: 'instant' | 'appointment';
  encryption?: 'session-encrypted';
  participantsJoined?: { patient: boolean; doctor: boolean };
  lastHeartbeatAt?: string;
  readOnlyAfterClose?: boolean;
  lastNetworkIssueAt?: string;
  status: ConsultationStatus;
  activeMode: ConsultationMode;
  modeHistory: Array<{ mode: ConsultationMode; switchedAt: string }>;
  messages: ChatMessage[];
  files: ConsultationFile[];
  summary?: string;
}

export interface PrescriptionItem {
  name?: string;
  medicine: string;
  form: string;
  dosage: string;
  frequency: string;
  duration: string;
  timing: string;
  precautions?: string;
}

export interface PrescriptionRecord {
  id: string;
  prescriptionId?: string;
  consultationId: string;
  doctorId: string;
  patientId: string;
  patientName?: string;
  patientAge?: string;
  doctorName?: string;
  doctorRegistration?: string;
  diagnosis: string;
  advice: string;
  precautions?: string;
  items: PrescriptionItem[];
  medicines?: Array<{
    name: string;
    form: string;
    dosage: string;
    frequency: string;
    timing: string;
    duration: string;
  }>;
  linkedDoshaAssessmentId?: string;
  status?: 'active' | 'expired';
  finalized?: boolean;
  createdBy?: string;
  audit?: { createdAt: string; createdBy: string };
  digitalSignatureMarker?: string;
  createdAt: string;
}

export interface HerbRecord {
  id: string;
  name: string;
  category: 'herb' | 'classical-medicine';
  benefits: string[];
  dosage: string;
  precautions: string[];
  references: string[];
  editableBy: Array<'doctor' | 'admin'>;
}

export interface DietMeal {
  name: string;
  items: string[];
  explanation?: string;
  options?: Array<{
    item: string;
    recommendation: 'Recommended' | 'Avoid';
    reason: string;
  }>;
}

export interface DietPlanRecord {
  id: string;
  patientId: string;
  dosha: DoshaType;
  season: 'vasanta' | 'grishma' | 'varsha' | 'sharada' | 'hemanta' | 'shishira';
  assessmentId?: string;
  basis: {
    priority: 'vikriti' | 'prakriti';
    line: string;
    prakritiPrimary: DoshaType;
    prakritiSecondary?: DoshaType;
    vikritiDominant: DoshaType | 'Balanced';
    vikritiSeverity: ImbalanceSeverity;
  };
  dietaryPreference?: 'veg' | 'sattvic';
  foodAllergies?: string[];
  meals: DietMeal[];
  avoid: string[];
  tips?: string[];
  doctorNotes?: string[];
  generatedAt: string;
}

export interface RoutineSuggestion {
  id: string;
  block:
    | 'Wake-up'
    | 'Morning hygiene'
    | 'Exercise / Yoga'
    | 'Bathing'
    | 'Meals timing'
    | 'Work / activity rhythm'
    | 'Evening wind-down'
    | 'Sleep';
  title: string;
  time: string;
  details: string;
  actions?: string[];
  reason?: string;
  recommendationType?: 'recommended' | 'avoid';
  reminderType?: 'wake' | 'meal' | 'sleep' | 'seasonal';
  reminderLabel?: string;
  yoga: string;
  pranayama: string;
}

export interface TherapyRecord {
  id: string;
  therapyId?: string;
  name: string;
  category: 'panchakarma' | 'supportive';
  description: string;
  primaryIndications: string[];
  doshaIndications: {
    recommendedFor: Array<DoshaType | 'Balanced'>;
    avoidFor: Array<DoshaType | 'Balanced'>;
  };
  contraindications: string[];
  requiresDoctorApproval: boolean;
  preTherapyGuidelines: string[];
  postTherapyCare: string[];
  duration: string;
  intensityLevel: 'low' | 'moderate' | 'high';
  // backward compatibility with existing templates
  eligibility?: string[];
  preGuidance?: string[];
  postGuidance?: string[];
}

export interface TherapyEligibilityResult {
  therapyId: string;
  outcome: 'eligible' | 'conditional' | 'not_recommended';
  reason: string;
  blocked: boolean;
  requiresDoctorApproval: boolean;
  basis: {
    vikriti: DoshaType | 'Balanced';
    severity: ImbalanceSeverity;
    prakriti: DoshaType;
    secondaryPrakriti?: DoshaType;
  };
}

export interface TherapyBookingRequest {
  id: string;
  requestId?: string;
  patientId: string;
  therapyId: string;
  doctorId: string;
  preferredDate: string;
  status: 'pending' | 'approved' | 'rejected';
  eligibility: TherapyEligibilityResult;
  doctorNotes?: string;
  preTherapyChecklist?: Array<{ item: string; acknowledged: boolean; acknowledgedAt?: string }>;
  postTherapyCare?: string[];
  progressNotes?: Array<{ note: string; createdAt: string }>;
  createdAt: string;
  reviewedAt?: string;
}

export interface PharmacyOrder {
  id: string;
  patientId: string;
  prescriptionId?: string;
  items: Array<{ name: string; qty: number }>;
  subscription: 'none' | 'monthly' | 'quarterly';
  status: 'placed' | 'packed' | 'shipped' | 'delivered';
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  channels: NotificationChannel[];
  title: string;
  message: string;
  valueScore?: number;
  contextKey?: string;
  seen: boolean;
  createdAt: string;
}
