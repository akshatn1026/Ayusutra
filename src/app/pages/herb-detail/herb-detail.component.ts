import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-herb-detail',
  templateUrl: './herb-detail.component.html',
  styleUrls: ['./herb-detail.component.scss']
})
export class HerbDetailComponent implements OnInit {
  herbName: string = '';
  herb: any = null;
  loading = true;
  error = '';
  
  activeTab: string = 'overview';
  
  showAiExplanation = false;
  aiExplanationText = '';
  aiLoading = false;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.herbName = decodeURIComponent(this.route.snapshot.paramMap.get('id') || '');
    if (!this.herbName) {
      this.loading = false;
      this.error = 'No herb specified.';
      return;
    }

    this.fetchHerbDetails();
  }

  fetchHerbDetails(): void {
    this.loading = true;
    this.http.get<any>(`/api/encyclopedia/${encodeURIComponent(this.herbName)}`)
      .subscribe(res => {
        this.loading = false;
        if (res.entry) {
          this.herb = res.entry;
        } else {
          this.error = 'Encyclopedia entry could not be found.';
        }
      }, err => {
        this.loading = false;
        if (err.error && err.error.error) {
          this.error = err.error.error;
        } else {
          this.error = 'Failed to connect to the encyclopedia backend.';
        }
        console.error('API Error:', err);
      });
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  generateAiExplanation(): void {
    if (this.aiExplanationText) {
      this.showAiExplanation = !this.showAiExplanation;
      return;
    }
    
    this.aiLoading = true;
    this.showAiExplanation = true;
    
    // Call the generic OpenAI endpoint to simplify the benefits text
    const payload = {
      content: `Explain these herbal benefits in very simple, easy-to-understand terms for a common person: ${this.herb.benefits}`
    };
    
    this.http.post<any>('/api/ai/guidance', payload)
      .subscribe(res => {
        this.aiLoading = false;
        if (res.success && res.text) {
          this.aiExplanationText = res.text;
        } else {
          this.aiExplanationText = "Could not generate AI explanation at this time.";
        }
      }, err => {
        this.aiLoading = false;
        this.aiExplanationText = "Failed to reach AI service.";
      });
  }
}
