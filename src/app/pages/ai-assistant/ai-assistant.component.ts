import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AyurvedaDataService } from '../../services/ayurveda-data.service';

interface AssistantMessage {
  sender: 'user' | 'assistant';
  text: string;
  createdAt: string;
  riskLevel?: 'low' | 'moderate' | 'high';
  contextUsed?: string[];
  safetyNote?: string;
}

@Component({
  selector: 'app-ai-assistant',
  templateUrl: './ai-assistant.component.html',
  styleUrls: ['./ai-assistant.component.scss']
})
export class AiAssistantComponent implements OnInit {
  query = '';
  loading = false;
  messages: AssistantMessage[] = [
    {
      sender: 'assistant',
      text: 'Namaste. Share symptoms, appetite, sleep, and bowel pattern for Ayurvedic guidance.',
      createdAt: new Date().toISOString()
    }
  ];
  suggestDoctor = false;
  suggestedQuestions = [
    'What should I eat today for my dosha?',
    'How can I improve sleep with Ayurveda?',
    'Which routine helps with stress and digestion?'
  ];
  contextualHints = [
    'Include appetite, sleep, bowel pattern, and energy level for better guidance.',
    'Mention duration and intensity of symptoms to improve response quality.',
    'Use the consultation module if symptoms are worsening or persistent.'
  ];
  recentTopics: string[] = [];
  doshaPrompt = '';

  constructor(
    private auth: AuthService,
    private ayurvedaData: AyurvedaDataService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    if (!user || user.role !== 'patient') return;
    const latest = this.auth.getLatestDoshaAssessment(user.id);
    if (!latest) {
      this.doshaPrompt = 'Complete dosha assessment to improve assistant personalization.';
      return;
    }
    const days = Math.floor((Date.now() - new Date(latest.submittedAt).getTime()) / (24 * 60 * 60 * 1000));
    if (days >= 30) {
      this.doshaPrompt = `Your dosha assessment is ${days} days old. Reassess for updated guidance.`;
    }
  }

  ask(): void {
    const input = this.query.trim();
    if (!input) return;
    const user = this.auth.getCurrentUser();
    if (!user || user.role !== 'patient') {
      this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/ai-assistant' } });
      return;
    }
    this.pushRecentTopic(input);
    this.messages.push({ sender: 'user', text: input, createdAt: new Date().toISOString() });
    this.loading = true;
    setTimeout(() => {
      const answer = this.ayurvedaData.answerPersonalizedAyurvedaQuery(user.id, input);
      this.messages.push({
        sender: 'assistant',
        text: answer.reply,
        createdAt: new Date().toISOString(),
        riskLevel: answer.riskLevel,
        contextUsed: answer.contextUsed,
        safetyNote: answer.safetyNote
      });
      this.suggestDoctor = answer.suggestDoctor;
      this.loading = false;
      this.query = '';
    }, 500);
  }

  consultDoctor(): void {
    const user = this.auth.getCurrentUser();
    if (!user) {
      this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/ai-assistant' } });
      return;
    }
    const latestUserMessage =
      [...this.messages].reverse().find((m) => m.sender === 'user')?.text ||
      this.recentTopics[0] ||
      '';
    this.router.navigate(['/consult'], {
      queryParams: {
        fromAi: '1',
        issue: latestUserMessage.slice(0, 180)
      }
    });
  }

  applySuggestedQuestion(question: string): void {
    this.query = question;
    this.ask();
  }

  updateDoshaContext(): void {
    this.router.navigate(['/dosha-assessment'], { queryParams: { source: 'ai-assistant' } });
  }

  private pushRecentTopic(text: string): void {
    const normalized = text.trim();
    if (!normalized) return;
    const existing = this.recentTopics.findIndex((x) => x.toLowerCase() === normalized.toLowerCase());
    if (existing >= 0) this.recentTopics.splice(existing, 1);
    this.recentTopics.unshift(normalized);
    this.recentTopics = this.recentTopics.slice(0, 5);
  }
}
