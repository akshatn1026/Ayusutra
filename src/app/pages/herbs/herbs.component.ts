import { Component, OnInit, NgZone, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-herbs',
  templateUrl: './herbs.component.html',
  styleUrls: ['./herbs.component.scss']
})
export class HerbsComponent implements OnInit, OnDestroy {
  query = '';
  herbs: any[] = [];
  suggestions: any[] = [];
  showSuggestions = false;
  
  loading = false;
  error = '';
  didYouMean = '';

  isListening = false;
  recognition: any;

  private searchTimeout: any;

  constructor(private router: Router, private http: HttpClient, private ngZone: NgZone) {
    this.initSpeechRecognition();
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
  }

  private initSpeechRecognition(): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-IN'; // Better for Ayurvedic terms

      this.recognition.onstart = () => {
        this.ngZone.run(() => { this.isListening = true; });
      };

      this.recognition.onresult = (event: any) => {
        this.ngZone.run(() => {
          this.query = event.results[0][0].transcript;
          this.isListening = false;
          this.executeSearch();
        });
      };

      this.recognition.onerror = (event: any) => {
        this.ngZone.run(() => {
          console.error('Speech recognition error', event.error);
          this.isListening = false;
        });
      };

      this.recognition.onend = () => {
        this.ngZone.run(() => { this.isListening = false; });
      };
    }
  }

  toggleVoiceSearch(): void {
    if (!this.recognition) {
      alert('Voice search is not supported in this browser.');
      return;
    }
    if (this.isListening) {
      this.recognition.stop();
    } else {
      this.recognition.start();
    }
  }

  onSearchInput(): void {
    this.didYouMean = '';
    const q = this.query.trim();
    if (q.length < 2) {
      this.suggestions = [];
      this.showSuggestions = false;
      return;
    }

    // Debounce autocomplete calls
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    
    this.searchTimeout = setTimeout(() => {
      this.http.get<any>(`/api/herbs/suggestions?q=${encodeURIComponent(q)}`)
        .subscribe(res => {
          if (res.success) {
            this.suggestions = res.suggestions;
            this.showSuggestions = this.suggestions.length > 0;
          }
        }, err => console.error(err));
    }, 300);
  }

  selectSuggestion(name: string): void {
    this.query = name;
    this.showSuggestions = false;
    this.suggestions = [];
    this.didYouMean = '';
    this.executeSearch();
  }

  async executeSearch(): Promise<void> {
    this.showSuggestions = false;
    this.error = '';
    this.didYouMean = '';
    const q = this.query.trim();
    
    if (q.length < 2) {
      this.herbs = [];
      return;
    }
    
    this.loading = true;
    
    this.http.get<any>(`/api/herbs/search?q=${encodeURIComponent(q)}`)
      .subscribe(res => {
        this.loading = false;
        if (res.success) {
          this.herbs = res.results;
          if (this.herbs.length === 0) {
            this.error = 'No comprehensive data found in the encyclopedia. Try checking spelling.';
            // Basic hardcoded spell check example for common misspelled terms
            if (q.toLowerCase() === 'ashwa') this.didYouMean = 'Ashwagandha';
            if (q.toLowerCase() === 'brami') this.didYouMean = 'Brahmi';
          } else if (this.herbs.length > 0 && this.herbs[0].herb_name.toLowerCase() !== q.toLowerCase()) {
            // If the top result doesn't exactly match the query, subtly suggest it
             const match = this.herbs.find(h => h.herb_name.toLowerCase() === q.toLowerCase());
             if (!match) {
                 this.didYouMean = this.herbs[0].herb_name;
             }
          }
        } else {
          this.error = 'Failed to search encyclopedias.';
        }
      }, err => {
        this.loading = false;
        console.error('API Error:', err);
        if (err.error && err.error.error) {
          this.error = err.error.error;
        } else {
          this.error = 'Failed to connect to backend encyclopedias.';
        }
      });
  }

  truncate(text: string, limit: number): string {
    if (!text) return '';
    if (text.length <= limit) return text;
    return text.substring(0, limit) + '...';
  }

  openHerb(herb: any): void {
    // Navigate using the exact name which the detail component will fetch via API
    this.router.navigate(['/herbs', encodeURIComponent(herb.herb_name)]);
  }
}
