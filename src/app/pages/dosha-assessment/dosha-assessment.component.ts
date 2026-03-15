import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  AuthService,
  DoshaAssessmentDraft,
  DoshaAssessmentRecord,
  DoshaSymptomInput,
  SymptomSeverity
} from '../../services/auth.service';
import { AyurvedaDataService } from '../../services/ayurveda-data.service';
import {
  DoshaAssessmentService,
  DoshaCooldownStatus,
  DoshaSectionConfig,
  DoshaSymptomConfig
} from '../../services/dosha-assessment.service';

interface FlattenedQuestion {
  key: string;
  prompt: string;
  sectionId: string;
  sectionTitle: string;
  sectionPurpose: string;
  options: Array<{ key: string; label: string }>;
}

type AssessmentStage = 'loading' | 'valid' | 'intro' | 'prakriti' | 'vikriti';

@Component({
  selector: 'app-dosha-assessment',
  templateUrl: './dosha-assessment.component.html',
  styleUrls: ['./dosha-assessment.component.scss']
})
export class DoshaAssessmentComponent implements OnInit, OnDestroy {
  assessmentForm!: FormGroup<Record<string, FormControl<string | null>>>;
  stage: AssessmentStage = 'loading';
  currentStep = 0;
  submitAttempted = false;
  submitInProgress = false;
  errorMessage = '';
  infoMessage = '';
  sourcePrompt = '';
  currentUserId = '';
  latestRecord: DoshaAssessmentRecord | null = null;
  assessmentHistory: DoshaAssessmentRecord[] = [];
  cooldown: DoshaCooldownStatus = { canReassess: true, cooldownDays: 30, daysSinceLast: null, message: '' };
  doctorApproved = false;
  noSymptoms = false;
  lastAutoSavedAt = '';
  supportiveNotice = 'This assessment is supportive and does not diagnose disease.';
  safetyNotice = '';

  sections: DoshaSectionConfig[] = [];
  questions: FlattenedQuestion[] = [];
  symptoms: DoshaSymptomConfig[] = [];
  symptomSelections: Record<string, boolean> = {};
  symptomSeverity: Record<string, SymptomSeverity> = {};

  private formSub?: Subscription;
  private autosaveTimer: any = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private ayurvedaData: AyurvedaDataService,
    private doshaApi: DoshaAssessmentService
  ) {}

  async ngOnInit(): Promise<void> {
    const user = this.authService.getCurrentUser();
    if (!user || user.role !== 'patient') {
      this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/dosha-assessment' } });
      return;
    }
    this.currentUserId = user.id;
    this.doctorApproved = this.route.snapshot.queryParamMap.get('doctorApproved') === 'true';
    this.sourcePrompt = this.route.snapshot.queryParamMap.get('source') || '';
    this.resolveSourcePrompt();

    try {
      const [config, assessments, draft] = await Promise.all([
        this.doshaApi.getConfig(),
        this.doshaApi.getAssessments(24),
        this.doshaApi.getDraft()
      ]);

      this.sections = config.sections || [];
      this.questions = this.flattenQuestions(this.sections);
      this.symptoms = config.symptoms || [];
      this.cooldown = assessments.cooldown || config.cooldown || this.cooldown;
      this.latestRecord = assessments.latest || config.latestAssessment || null;
      this.assessmentHistory = assessments.history || [];
      this.authService.replaceDoshaAssessments(this.currentUserId, this.assessmentHistory);
      this.initializeForm();
      this.initializeSymptoms();

      if (draft) this.applyDraft(draft);
      else {
        this.authService.replaceDoshaDraft(this.currentUserId, null);
        this.stage = this.cooldown.canReassess || this.doctorApproved ? 'intro' : 'valid';
      }

      if (this.stage === 'loading') {
        this.stage = this.cooldown.canReassess || this.doctorApproved ? 'intro' : 'valid';
      }

      this.formSub = this.assessmentForm.valueChanges.subscribe(() => {
        if (this.stage === 'prakriti') this.autoSaveDraft();
      });
    } catch (err: any) {
      this.errorMessage = err?.error?.error || err?.message || 'Unable to load assessment configuration.';
      this.stage = 'intro';
      this.initializeForm();
      this.initializeSymptoms();
    }
  }

  ngOnDestroy(): void {
    if (this.formSub) this.formSub.unsubscribe();
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
  }

  get totalSteps(): number {
    return this.questions.length + 1;
  }

  get progressPercent(): number {
    if (this.stage === 'vikriti') return 100;
    const denominator = Math.max(1, this.totalSteps);
    return ((this.currentStep + 1) / denominator) * 100;
  }

  get activeQuestion(): FlattenedQuestion {
    return this.questions[this.currentStep];
  }

  get validTillDate(): string {
    return this.latestRecord?.validTill || '';
  }

  get selectedSymptomsCount(): number {
    return this.symptoms.filter((s) => this.symptomSelections[s.key]).length;
  }

  get currentSectionLabel(): string {
    return this.activeQuestion?.sectionTitle || '';
  }

  get currentSectionPurpose(): string {
    return this.activeQuestion?.sectionPurpose || '';
  }

  get reassessPromptText(): string {
    if (this.cooldown?.message) return this.cooldown.message;
    if (this.cooldown?.daysSinceLast !== null) {
      return `Your last assessment was ${this.cooldown.daysSinceLast} day(s) ago.`;
    }
    return 'Reassessment is available.';
  }

  getAnswerControl(key: string): FormControl<string | null> {
    return this.assessmentForm.get(key) as FormControl<string | null>;
  }

  startAssessment(): void {
    this.errorMessage = '';
    this.stage = 'prakriti';
    this.currentStep = 0;
    this.autoSaveDraft();
  }

  useExistingAssessment(): void {
    this.router.navigate(['/dosha-report']);
  }

  requestReassessment(): void {
    if (!this.cooldown.canReassess && !this.doctorApproved) {
      this.errorMessage = this.reassessPromptText;
      return;
    }
    this.errorMessage = '';
    this.stage = 'intro';
  }

  goToNextStep(): void {
    if (this.stage !== 'prakriti') return;
    this.submitAttempted = true;
    const control = this.getAnswerControl(this.activeQuestion.key);
    control.markAsTouched();
    if (control.invalid) return;
    if (this.currentStep < this.questions.length - 1) {
      this.currentStep += 1;
      this.submitAttempted = false;
      this.autoSaveDraft();
      return;
    }
    this.stage = 'vikriti';
    this.submitAttempted = false;
    this.autoSaveDraft();
  }

  goToPreviousStep(): void {
    if (this.stage === 'vikriti') {
      this.stage = 'prakriti';
      this.currentStep = Math.max(this.questions.length - 1, 0);
      this.autoSaveDraft();
      return;
    }
    if (this.currentStep > 0) {
      this.currentStep -= 1;
      this.submitAttempted = false;
      this.autoSaveDraft();
    }
  }

  goToStep(index: number): void {
    if (this.stage !== 'prakriti') return;
    if (index < 0 || index >= this.questions.length) return;
    this.currentStep = index;
    this.submitAttempted = false;
    this.autoSaveDraft();
  }

  toggleNoSymptoms(value: boolean): void {
    this.noSymptoms = value;
    if (value) this.symptoms.forEach((s) => (this.symptomSelections[s.key] = false));
    this.autoSaveDraft();
  }

  toggleSymptom(symptomKey: string, checked: boolean): void {
    this.symptomSelections[symptomKey] = checked;
    if (checked) this.noSymptoms = false;
    this.autoSaveDraft();
  }

  setSeverity(symptomKey: string, severity: SymptomSeverity): void {
    this.symptomSeverity[symptomKey] = severity;
    this.autoSaveDraft();
  }

  async onSubmit(): Promise<void> {
    this.submitAttempted = true;
    this.errorMessage = '';
    this.safetyNotice = '';

    if (this.assessmentForm.invalid) {
      this.assessmentForm.markAllAsTouched();
      this.stage = 'prakriti';
      return;
    }
    if (!this.noSymptoms && this.selectedSymptomsCount === 0) {
      this.stage = 'vikriti';
      this.errorMessage = 'Select at least one symptom or choose no recent symptoms.';
      return;
    }
    if (this.noSymptoms && this.selectedSymptomsCount > 0) {
      this.stage = 'vikriti';
      this.errorMessage = 'Please either choose symptoms or no symptoms.';
      return;
    }
    if (this.submitInProgress) return;

    this.submitInProgress = true;
    try {
      const answers = this.questions.reduce((acc, question) => {
        const selected = this.assessmentForm.value[question.key];
        if (selected) acc[question.key] = selected;
        return acc;
      }, {} as Record<string, string>);

      const selectedSymptoms = this.symptoms
        .filter((symptom) => this.symptomSelections[symptom.key])
        .map((symptom) => ({
          key: symptom.key,
          label: symptom.label,
          severity: this.symptomSeverity[symptom.key]
        }));

      const response = await this.doshaApi.submitAssessment({
        answers,
        symptoms: selectedSymptoms,
        doctorApproved: this.doctorApproved
      });

      const latest = response.record;
      this.supportiveNotice = response.supportiveNotice || this.supportiveNotice;
      this.safetyNotice = response.safety || '';
      this.latestRecord = latest;
      const assessments = await this.doshaApi.getAssessments(24);
      this.assessmentHistory = assessments.history || [latest];
      this.cooldown = assessments.cooldown || this.cooldown;
      this.authService.replaceDoshaAssessments(this.currentUserId, this.assessmentHistory);
      this.authService.replaceDoshaDraft(this.currentUserId, null);

      this.ayurvedaData.createNotification(
        this.currentUserId,
        'general',
        'Dosha assessment updated',
        response.summary || 'Your dosha pattern has been updated and will improve personalization.',
        ['inApp', 'email']
      );
      if (this.safetyNotice) {
        this.ayurvedaData.createNotification(
          this.currentUserId,
          'general',
          'Consultation recommended',
          this.safetyNotice,
          ['inApp']
        );
      }

      this.router.navigate(['/dosha-report']);
    } catch (err: any) {
      if (Number(err?.status || 0) === 409) {
        const msg = err?.error?.cooldown?.message || err?.error?.error || 'Reassessment cooldown is active.';
        this.errorMessage = msg;
        this.stage = 'valid';
      } else {
        this.errorMessage = err?.error?.error || err?.message || 'Unable to submit assessment.';
      }
    } finally {
      this.submitInProgress = false;
    }
  }

  private resolveSourcePrompt(): void {
    if (this.sourcePrompt === 'guidance') {
      this.infoMessage = 'Reassessing dosha improves personalized guidance quality.';
      return;
    }
    if (this.sourcePrompt === 'ai-assistant') {
      this.infoMessage = 'Reassessing dosha improves AI assistant context and recommendations.';
      return;
    }
    if (this.sourcePrompt === 'dashboard') {
      this.infoMessage = 'Your dashboard recommendations improve after each dosha reassessment.';
      return;
    }
    if (this.sourcePrompt === 'diet-plan') {
      this.infoMessage = 'Diet plans are personalized using your constitution and current imbalance.';
      return;
    }
    if (this.sourcePrompt === 'daily-routine') {
      this.infoMessage = 'Routine suggestions are personalized from your dosha assessment.';
    }
  }

  private initializeForm(): void {
    if (this.assessmentForm) return;
    const controls: Record<string, FormControl<string | null>> = {};
    this.questions.forEach((q) => {
      controls[q.key] = this.fb.control<string | null>(null, { validators: [Validators.required] });
    });
    this.assessmentForm = this.fb.group(controls);
  }

  private initializeSymptoms(): void {
    this.symptoms.forEach((symptom) => {
      if (!(symptom.key in this.symptomSelections)) this.symptomSelections[symptom.key] = false;
      if (!(symptom.key in this.symptomSeverity)) this.symptomSeverity[symptom.key] = 'Low';
    });
  }

  private flattenQuestions(sections: DoshaSectionConfig[]): FlattenedQuestion[] {
    const flattened: FlattenedQuestion[] = [];
    for (const section of sections || []) {
      for (const question of section.questions || []) {
        flattened.push({
          key: question.key,
          prompt: question.prompt,
          sectionId: section.id,
          sectionTitle: section.title,
          sectionPurpose: section.purpose,
          options: (question.options || []).map((option) => ({ key: option.key, label: option.label }))
        });
      }
    }
    return flattened;
  }

  private autoSaveDraft(): void {
    if (!this.currentUserId || !this.assessmentForm) return;
    const answers = this.questions.reduce((acc, question) => {
      const value = this.assessmentForm.value[question.key];
      if (value) acc[question.key] = value;
      return acc;
    }, {} as Record<string, any>);
    const selectedSymptoms: DoshaSymptomInput[] = this.symptoms
      .filter((symptom) => this.symptomSelections[symptom.key])
      .map((symptom) => ({
        key: symptom.key,
        label: symptom.label,
        dosha: this.deriveDoshaFromSymptom(symptom),
        severity: this.symptomSeverity[symptom.key]
      }));
    const draft: DoshaAssessmentDraft = {
      patientId: this.currentUserId,
      currentStep: this.currentStep,
      stage: this.stage === 'vikriti' ? 'vikriti' : this.stage === 'prakriti' ? 'prakriti' : 'intro',
      answers,
      selectedSymptoms,
      noSymptoms: this.noSymptoms,
      submitToken: `resume_${this.currentUserId}`,
      updatedAt: new Date().toISOString()
    };

    this.authService.replaceDoshaDraft(this.currentUserId, draft);
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(async () => {
      try {
        const saved = await this.doshaApi.saveDraft(draft);
        this.lastAutoSavedAt = saved.updatedAt;
      } catch {
        this.lastAutoSavedAt = new Date().toISOString();
      }
    }, 350);
  }

  private applyDraft(draft: DoshaAssessmentDraft): void {
    this.currentStep = Math.max(0, Math.min(this.questions.length - 1, Number(draft.currentStep || 0)));
    this.stage = draft.stage === 'vikriti' || draft.stage === 'prakriti' ? draft.stage : 'intro';
    Object.entries(draft.answers || {}).forEach(([key, value]) => {
      if (this.assessmentForm.contains(key)) this.getAnswerControl(key).setValue(String(value), { emitEvent: false });
    });
    this.noSymptoms = !!draft.noSymptoms;
    (draft.selectedSymptoms || []).forEach((symptom) => {
      this.symptomSelections[symptom.key] = true;
      this.symptomSeverity[symptom.key] = symptom.severity || 'Low';
    });
    this.lastAutoSavedAt = draft.updatedAt || '';
    this.authService.replaceDoshaDraft(this.currentUserId, draft);
  }

  private deriveDoshaFromSymptom(symptom: DoshaSymptomConfig): 'Vata' | 'Pitta' | 'Kapha' {
    const v = Number(symptom?.map?.Vata || 0);
    const p = Number(symptom?.map?.Pitta || 0);
    const k = Number(symptom?.map?.Kapha || 0);
    if (p >= v && p >= k) return 'Pitta';
    if (k >= v && k >= p) return 'Kapha';
    return 'Vata';
  }
}
