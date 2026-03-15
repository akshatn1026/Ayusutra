import { Directive, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { LanguageService, AppLanguage } from '../services/language.service';

@Directive({
  selector: '[appTranslateSubtree]'
})
export class TranslateSubtreeDirective implements OnInit, OnDestroy {
  private readonly textOriginal = new WeakMap<Text, string>();
  private readonly attrOriginal = new WeakMap<Element, Record<string, string>>();
  private sub?: Subscription;
  private observer?: MutationObserver;
  private currentLang: AppLanguage = 'en';
  private readonly ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'value'];

  private readonly PHRASES: Record<string, string> = {
    'Home': 'होम',
    'About': 'परिचय',
    'Services': 'सेवाएं',
    'Doctors': 'डॉक्टर्स',
    'AI Assistant': 'एआई सहायक',
    'Herbs': 'जड़ी-बूटियां',
    'Panchakarma': 'पंचकर्म',
    'Contact': 'संपर्क',
    'My Dashboard': 'मेरा डैशबोर्ड',
    'Dosha Assessment': 'दोष आकलन',
    'Diet Plan': 'आहार योजना',
    'Daily Routine': 'दैनिक दिनचर्या',
    'My Consultations': 'मेरे परामर्श',
    'My Prescriptions': 'मेरी पर्चियां',
    'Doctor Dashboard': 'डॉक्टर डैशबोर्ड',
    'Consultations': 'परामर्श',
    'Prescriptions': 'पर्चियां',
    'Create Account': 'अकाउंट बनाएं',
    'Create Patient Account': 'रोगी अकाउंट बनाएं',
    'Create Doctor Account': 'डॉक्टर अकाउंट बनाएं',
    'Login': 'लॉगिन',
    'Login as Patient': 'रोगी लॉगिन',
    'Login as Doctor': 'डॉक्टर लॉगिन',
    'Logout': 'लॉगआउट',
    'Subscribe': 'सब्सक्राइब',
    'Email address': 'ईमेल पता',
    'Search modules': 'मॉड्यूल खोजें',
    'No modules found': 'कोई मॉड्यूल नहीं मिला',
    'Skip to main content': 'मुख्य सामग्री पर जाएं',
    'Forgot Password?': 'पासवर्ड भूल गए?',
    'Loading': 'लोड हो रहा है',
    'Loading...': 'लोड हो रहा है...',
    'Verified': 'सत्यापित',
    'View': 'देखें',
    'Download': 'डाउनलोड',
    'Save': 'सेव',
    'Saved': 'सेव किया गया',
    'Send': 'भेजें',
    'Cancel': 'रद्द करें',
    'Confirm': 'पुष्टि करें',
    'Next': 'अगला',
    'Previous': 'पिछला',
    'Back': 'वापस',
    'Enable Reminders': 'रिमाइंडर चालू करें',
    'Disable Reminders': 'रिमाइंडर बंद करें',
    'Set Reminder': 'रिमाइंडर सेट करें',
    'Disable Reminder': 'रिमाइंडर हटाएं',
    'Compact': 'कॉम्पैक्ट',
    'Comfortable': 'आरामदायक'
  };

  private readonly TERMS: Array<[RegExp, string]> = [
    [/\bHome\b/g, 'होम'],
    [/\bAbout\b/g, 'परिचय'],
    [/\bServices\b/g, 'सेवाएं'],
    [/\bDoctor(s)?\b/g, 'डॉक्टर'],
    [/\bPatient(s)?\b/g, 'रोगी'],
    [/\bAssessment\b/g, 'आकलन'],
    [/\bConsultation(s)?\b/g, 'परामर्श'],
    [/\bPrescription(s)?\b/g, 'पर्चियां'],
    [/\bDashboard\b/g, 'डैशबोर्ड'],
    [/\bDiet\b/g, 'आहार'],
    [/\bRoutine\b/g, 'दिनचर्या'],
    [/\bProfile\b/g, 'प्रोफाइल'],
    [/\bNotifications?\b/g, 'सूचनाएं'],
    [/\bDownload\b/g, 'डाउनलोड'],
    [/\bUpload\b/g, 'अपलोड'],
    [/\bSubmit\b/g, 'सबमिट'],
    [/\bLogin\b/g, 'लॉगिन'],
    [/\bLogout\b/g, 'लॉगआउट'],
    [/\bSearch\b/g, 'खोजें'],
    [/\bEmail\b/g, 'ईमेल'],
    [/\bPassword\b/g, 'पासवर्ड'],
    [/\bStatus\b/g, 'स्थिति'],
    [/\bDate\b/g, 'तारीख'],
    [/\bTime\b/g, 'समय'],
    [/\bSummary\b/g, 'सारांश'],
    [/\bHistory\b/g, 'इतिहास'],
    [/\bTips\b/g, 'सुझाव'],
    [/\bActions?\b/g, 'कार्य'],
    [/\bLoading\b/g, 'लोड हो रहा है']
  ];

  constructor(private host: ElementRef<HTMLElement>, private language: LanguageService) {}

  ngOnInit(): void {
    this.currentLang = this.language.currentLanguage;
    this.applyToSubtree(this.host.nativeElement);
    this.sub = this.language.languageChanges.subscribe((lang) => {
      this.currentLang = lang;
      this.applyToSubtree(this.host.nativeElement);
    });
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === Node.ELEMENT_NODE) this.applyToSubtree(n as HTMLElement);
          if (n.nodeType === Node.TEXT_NODE) this.translateTextNode(n as Text);
        });
      });
    });
    this.observer.observe(this.host.nativeElement, { childList: true, subtree: true });
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe();
    if (this.observer) this.observer.disconnect();
  }

  private applyToSubtree(root: HTMLElement): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      this.translateTextNode(node as Text);
      node = walker.nextNode();
    }
    const elements = root.querySelectorAll('*');
    elements.forEach((el) => this.translateAttrs(el));
    this.translateAttrs(root);
  }

  private translateTextNode(node: Text): void {
    const value = node.nodeValue || '';
    if (!value.trim()) return;
    const parentTag = node.parentElement?.tagName.toLowerCase();
    if (parentTag === 'script' || parentTag === 'style' || parentTag === 'code') return;
    if (!this.textOriginal.has(node)) this.textOriginal.set(node, value);
    const original = this.textOriginal.get(node) || value;
    node.nodeValue = this.currentLang === 'hi' ? this.toHindi(original) : original;
  }

  private translateAttrs(el: Element): void {
    const record = this.attrOriginal.get(el) || {};
    let changed = false;
    this.ATTRS.forEach((attr) => {
      const cur = el.getAttribute(attr);
      if (cur === null) return;
      if (!(attr in record)) {
        record[attr] = cur;
        changed = true;
      }
      const original = record[attr];
      const next = this.currentLang === 'hi' ? this.toHindi(original) : original;
      if (next !== cur) el.setAttribute(attr, next);
    });
    if (changed) this.attrOriginal.set(el, record);
  }

  private toHindi(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return input;
    if (this.PHRASES[trimmed]) {
      return input.replace(trimmed, this.PHRASES[trimmed]);
    }
    let out = input;
    this.TERMS.forEach(([pattern, replacement]) => {
      out = out.replace(pattern, replacement);
    });
    return out;
  }
}
