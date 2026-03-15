import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService, DoshaAssessmentRecord } from '../../services/auth.service';
import { AyurvedaDataService } from '../../services/ayurveda-data.service';
import { HerbRecord, PrescriptionItem, PrescriptionRecord } from '../../models/ayurveda.models';
import { PdfExportService } from '../../services/pdf-export.service';

@Component({
  selector: 'app-prescription',
  templateUrl: './prescription.component.html',
  styleUrls: ['./prescription.component.scss']
})
export class PrescriptionComponent implements OnInit {
  consultationId = '';
  prescriptionId = '';
  diagnosis = '';
  advice = '';
  precautions = '';
  doctorConfirmed = false;
  items: PrescriptionItem[] = [];
  saved: PrescriptionRecord | null = null;
  error = '';
  status = '';
  mode: 'doctor-create' | 'patient-view' | 'patient-list' = 'doctor-create';
  medicinesCatalog: HerbRecord[] = [];
  medicineSuggestions: Record<number, HerbRecord[]> = {};
  doctorHistory: PrescriptionRecord[] = [];
  patientPrescriptions: PrescriptionRecord[] = [];
  selectedReferenceId = '';
  context = {
    patientName: '',
    patientAge: 'N/A',
    doctorName: '',
    doctorRegistration: '',
    date: '',
    consultationSummary: '',
    linkedDoshaAssessmentId: '',
    prakriti: '',
    vikriti: ''
  };
  validationErrors: string[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private ayurvedaData: AyurvedaDataService,
    private pdfExport: PdfExportService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    if (!user) {
      this.error = 'Login required.';
      return;
    }

    const currentPath = this.route.snapshot.routeConfig?.path;
    const isPatientRoute = currentPath === 'patient/prescription/:prescriptionId';
    const isPatientListRoute = currentPath === 'patient/prescriptions';
    this.mode = isPatientRoute ? 'patient-view' : isPatientListRoute ? 'patient-list' : 'doctor-create';

    if (this.mode === 'patient-list') {
      this.loadPatientPrescriptionList(user.id);
      return;
    }

    if (this.mode === 'patient-view') {
      this.prescriptionId = this.route.snapshot.paramMap.get('prescriptionId') || '';
      this.loadPatientPrescriptionView(user.id);
      return;
    }

    const doctorProfile = this.ayurvedaData.getDoctorById(user.id);
    if (user.role !== 'doctor' || !doctorProfile?.verified) {
      this.error = 'Only verified doctors can create prescriptions.';
      return;
    }

    const sessionId = this.route.snapshot.paramMap.get('sessionId') || this.route.snapshot.paramMap.get('consultationId') || '';
    this.loadDoctorCreationContext(sessionId, user.id);
    this.medicinesCatalog = this.ayurvedaData.getHerbs('');
    this.doctorHistory = this.ayurvedaData.getPrescriptionsForDoctor(user.id);
    this.addItem();
  }

  addItem(): void {
    this.items.push({
      name: '',
      medicine: '',
      form: '',
      dosage: '',
      frequency: '',
      duration: '',
      timing: '',
      precautions: ''
    });
  }

  removeItem(index: number): void {
    if (index < 0 || index >= this.items.length) return;
    this.items.splice(index, 1);
    delete this.medicineSuggestions[index];
  }

  searchMedicine(index: number, query: string): void {
    const q = query.trim();
    if (!q) {
      this.medicineSuggestions[index] = [];
      return;
    }
    this.medicineSuggestions[index] = this.ayurvedaData.getHerbs(q).slice(0, 6);
  }

  selectMedicine(index: number, herb: HerbRecord): void {
    const item = this.items[index];
    if (!item) return;
    item.name = herb.name;
    item.medicine = herb.name;
    if (!item.form) item.form = herb.category === 'classical-medicine' ? 'Vati' : 'Churna';
    if (!item.precautions) item.precautions = herb.precautions.join('; ');
    this.medicineSuggestions[index] = [];
  }

  reuseReference(): void {
    const id = this.selectedReferenceId.trim();
    if (!id) return;
    const ref = this.ayurvedaData.getPrescriptionById(id);
    if (!ref) {
      this.status = 'Reference prescription not found.';
      return;
    }
    this.diagnosis = ref.diagnosis;
    this.advice = ref.advice;
    this.precautions = ref.precautions || '';
    this.items = ref.items.map((i) => ({
      name: i.name || i.medicine,
      medicine: i.medicine || i.name || '',
      form: i.form,
      dosage: i.dosage,
      frequency: i.frequency,
      duration: i.duration,
      timing: i.timing,
      precautions: i.precautions || ''
    }));
    this.doctorConfirmed = false;
    this.status = 'Loaded reference. Review and confirm before saving.';
  }

  savePrescription(): void {
    this.validationErrors = [];
    this.status = '';
    this.error = '';

    const validationErrors = this.validateForSave();
    if (validationErrors.length > 0) {
      this.validationErrors = validationErrors;
      return;
    }

    const doctor = this.auth.getCurrentUser();
    const consult = this.ayurvedaData.getConsultationById(this.consultationId);
    if (!doctor || !consult) {
      this.error = 'Consultation context not found.';
      return;
    }

    const payload = {
      consultationId: this.consultationId,
      doctorId: doctor.id,
      patientId: consult.patientId,
      doctorName: this.context.doctorName,
      doctorSpecialization: (doctor as any)?.specialization || 'Ayurvedic Medicine',
      doctorRegistration: this.context.doctorRegistration,
      patientDetails: { name: this.context.patientName, age: this.context.patientAge },
      diagnosis: this.diagnosis,
      symptoms: this.context.consultationSummary,
      medicines: this.items.map((i) => ({
        medicine: i.name || i.medicine,
        form: i.form,
        dosage: i.dosage,
        frequency: i.frequency,
        timing: i.timing,
        duration: i.duration,
        instructions: i.precautions || ''
      })),
      dietRecommendation: this.advice,
      lifestyleAdvice: '',
      doctorNotes: this.precautions
    };

    this.http.post<any>('/api/prescriptions', payload).subscribe({
      next: (res) => {
        if (res.success && res.prescription) {
          this.saved = res.prescription;
          this.prescriptionId = res.prescription._id;
          this.status = 'Prescription finalized successfully. PDF generated.';
        } else {
          this.error = 'Unable to create prescription.';
        }
      },
      error: (err) => {
        this.error = err.error?.error || 'Unable to create prescription.';
      }
    });
  }

  downloadPdf(): void {
    const pdfUrl = (this.saved as any)?.pdf_url || (this.prescriptionId ? `/api/prescriptions/${this.prescriptionId}/download` : null);
    if (!pdfUrl) {
      this.error = 'PDF not available';
      return;
    }
    window.open(pdfUrl, '_blank');
  }

  viewPrescription(record: PrescriptionRecord): void {
    this.router.navigate(['/patient/prescription', record.id]);
  }

  downloadPrescription(record: PrescriptionRecord): void {
    const rows = [
      'Ayusutra - Ayurvedic Prescription',
      `Prescription ID: ${record.prescriptionId || record.id}`,
      `Date: ${new Date(record.createdAt).toLocaleString()}`,
      `Doctor: ${record.doctorName || record.doctorId}`,
      `Patient: ${record.patientName || record.patientId}`,
      '',
      `Diagnosis: ${record.diagnosis}`,
      '',
      'Medicines:',
      ...record.items.map((i, idx) => `${idx + 1}. ${i.name || i.medicine} | ${i.form} | ${i.dosage} | ${i.frequency} | ${i.timing} | ${i.duration}`),
      '',
      `Advice: ${record.advice}`,
      `Precautions: ${record.precautions || 'N/A'}`
    ];
    this.pdfExport.downloadSimplePdf(`prescription-${record.prescriptionId || record.id}.pdf`, 'Ayusutra Ayurvedic Prescription', rows);
  }

  getPrescriptionStatus(record: PrescriptionRecord): string {
    if (record.status) return record.status;
    return record.finalized ? 'active' : 'draft';
  }

  goToConsultations(): void {
    this.router.navigate(['/consult']);
  }

  sharePrescription(): void {
    const id = this.saved?.id || this.prescriptionId;
    if (!id) return;
    const url = `${window.location.origin}/patient/prescription/${id}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        this.status = 'Share link copied.';
      }).catch(() => {
        this.status = `Share URL: ${url}`;
      });
    } else {
      this.status = `Share URL: ${url}`;
    }
  }

  private loadDoctorCreationContext(sessionIdOrConsultationId: string, doctorId: string): void {
    if (!sessionIdOrConsultationId) {
      this.error = 'Missing consultation session id.';
      return;
    }
    const consult =
      this.ayurvedaData.getConsultationBySessionId(sessionIdOrConsultationId) ||
      this.ayurvedaData.getConsultationById(sessionIdOrConsultationId);
    if (!consult) {
      this.error = 'Consultation not found.';
      return;
    }
    if (consult.doctorId !== doctorId) {
      this.error = 'You cannot create prescription for this consultation.';
      return;
    }
    if (consult.status !== 'completed') {
      this.error = 'Consultation must be completed before prescription creation.';
      return;
    }
    const existing = this.ayurvedaData.getPrescriptionByConsultation(consult.id);
    if (existing?.finalized) {
      this.saved = existing;
      this.prescriptionId = existing.id;
      this.consultationId = consult.id;
      this.context = {
        patientName: existing.patientName || existing.patientId,
        patientAge: existing.patientAge || 'N/A',
        doctorName: existing.doctorName || doctorId,
        doctorRegistration: existing.doctorRegistration || 'N/A',
        date: existing.createdAt,
        consultationSummary: consult.summary || 'Consultation summary unavailable.',
        linkedDoshaAssessmentId: existing.linkedDoshaAssessmentId || '',
        prakriti: '',
        vikriti: ''
      };
      this.status = 'Prescription already finalized for this consultation. It is read-only.';
      return;
    }

    this.consultationId = consult.id;
    const doctor = this.ayurvedaData.getDoctorById(doctorId);
    const patient = this.auth.getPatientData(consult.patientId);
    const dosha = this.auth.getLatestDoshaAssessment(consult.patientId);
    this.context = {
      patientName: patient?.name || consult.patientId,
      patientAge: (patient as any)?.age ? String((patient as any).age) : 'N/A',
      doctorName: doctor?.fullName || doctorId,
      doctorRegistration: (doctor as any)?.registration || 'N/A',
      date: new Date().toISOString(),
      consultationSummary: consult.summary || 'Consultation summary unavailable.',
      linkedDoshaAssessmentId: dosha?.id || '',
      prakriti: this.formatPrakriti(dosha),
      vikriti: this.formatVikriti(dosha)
    };
  }

  private loadPatientPrescriptionView(patientId: string): void {
    if (!this.prescriptionId) {
      this.error = 'Missing prescription id.';
      return;
    }
    const record = this.ayurvedaData.getPrescriptionById(this.prescriptionId);
    if (!record) {
      this.error = 'Prescription not found.';
      return;
    }
    if (record.patientId !== patientId) {
      this.error = 'You are not allowed to access this prescription.';
      return;
    }
    this.saved = record;
    this.consultationId = record.consultationId;
    this.diagnosis = record.diagnosis;
    this.advice = record.advice;
    this.precautions = record.precautions || '';
    this.items = record.items.map((i) => ({ ...i }));
    this.context = {
      patientName: record.patientName || record.patientId,
      patientAge: record.patientAge || 'N/A',
      doctorName: record.doctorName || record.doctorId,
      doctorRegistration: record.doctorRegistration || 'N/A',
      date: record.createdAt,
      consultationSummary: this.ayurvedaData.getConsultationById(record.consultationId)?.summary || 'N/A',
      linkedDoshaAssessmentId: record.linkedDoshaAssessmentId || '',
      prakriti: '',
      vikriti: ''
    };
  }

  private loadPatientPrescriptionList(patientId: string): void {
    this.patientPrescriptions = this.ayurvedaData.getPrescriptionsForPatient(patientId);
    this.context.patientName = this.auth.getCurrentUser()?.fullName || '';
  }

  private validateForSave(): string[] {
    const errors: string[] = [];
    if (!this.consultationId) errors.push('Consultation id is missing.');
    if (!this.doctorConfirmed) errors.push('Doctor confirmation is required before finalization.');

    const medicines = this.items.filter((i) =>
      !!(i.name || i.medicine || i.form || i.dosage || i.frequency || i.timing || i.duration)
    );
    if (medicines.length < 1) errors.push('At least one medicine is required.');

    medicines.forEach((m, idx) => {
      if (!(m.name || m.medicine)) errors.push(`Medicine ${idx + 1}: name is required.`);
      if (!m.form?.trim()) errors.push(`Medicine ${idx + 1}: form is required.`);
      if (!m.dosage?.trim()) errors.push(`Medicine ${idx + 1}: dosage is required.`);
      if (!m.frequency?.trim()) errors.push(`Medicine ${idx + 1}: frequency is required.`);
      if (!m.timing?.trim()) errors.push(`Medicine ${idx + 1}: timing is required.`);
      if (!m.duration?.trim()) errors.push(`Medicine ${idx + 1}: duration is required.`);
    });
    return errors;
  }

  private formatPrakriti(record?: DoshaAssessmentRecord): string {
    if (!record) return 'N/A';
    const primary = record.prakriti?.primary || record.primaryDosha;
    const secondary = record.prakriti?.secondary || record.secondaryDosha;
    return secondary ? `${primary}-${secondary}` : primary;
  }

  private formatVikriti(record?: DoshaAssessmentRecord): string {
    if (!record) return 'N/A';
    return `${record.vikriti?.dominant || 'Balanced'} (${record.vikriti?.severity || 'Balanced'})`;
  }
}
