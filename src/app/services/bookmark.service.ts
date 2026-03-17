import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class BookmarkService {
  private readonly STORAGE_KEY = 'ayusutra_bookmarks_v1';
  private cache: Record<string, string[]> = {};

  constructor() {
    this.cache = this.read();
  }

  isBookmarked(scope: string, id: string): boolean {
    return (this.cache[scope] || []).includes(id);
  }

  toggle(scope: string, id: string): boolean {
    const current = new Set(this.cache[scope] || []);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    this.cache[scope] = Array.from(current);
    this.persist();
    return current.has(id);
  }

  list(scope: string): string[] {
    return [...(this.cache[scope] || [])];
  }

  private read(): Record<string, string[]> {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.cache));
    } catch {
    }
  }
}
