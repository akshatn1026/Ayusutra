import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AyurvedaDataService } from './ayurveda-data.service';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';

export interface StoreProduct {
  id: string;
  name: string;
  image: string;
  price: number;
  oldPrice: number;
  category: string;
  discountPercent: number;
  deliveryLabel: string;
}

export interface CartItem {
  productId: string;
  name: string;
  image: string;
  unitPrice: number;
  oldPrice: number;
  qty: number;
  deliveryLabel: string;
}

export interface ContactSubmission {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  userId?: string;
  createdAt: string;
}

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  createdAt: string;
  author: string;
}

@Injectable({
  providedIn: 'root'
})
export class StorefrontService {
  private readonly CART_KEY = 'ayusutra_storefront_carts_v1';
  private readonly CONTACT_KEY = 'ayusutra_storefront_contact_v1';
  private readonly NEWSLETTER_KEY = 'ayusutra_storefront_newsletter_v1';
  private readonly BLOG_KEY = 'ayusutra_storefront_blog_v1';

  constructor(
    private data: AyurvedaDataService,
    private http: HttpClient
  ) {}

  async getProducts(filters?: { q?: string; category?: string; discountOnly?: boolean }): Promise<StoreProduct[]> {
    const params = new URLSearchParams();
    if (filters?.q) params.set('q', filters.q);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.discountOnly) params.set('discount', '1');
    const query = params.toString();
    const url = query ? `/api/store/products?${query}` : '/api/store/products';
    const res = await firstValueFrom(this.http.get<{ items: StoreProduct[] }>(url));
    return (res.items || []).map((item) => ({ ...item }));
  }

  async getCategories(): Promise<string[]> {
    const res = await firstValueFrom(this.http.get<{ items: string[] }>('/api/store/categories'));
    return (res.items || []).filter(Boolean);
  }

  getCart(userId: string): CartItem[] {
    const all = this.read<Record<string, CartItem[]>>(this.CART_KEY, {});
    return (all[userId] || []).map((item) => ({ ...item }));
  }

  setCart(userId: string, items: CartItem[]): void {
    const all = this.read<Record<string, CartItem[]>>(this.CART_KEY, {});
    all[userId] = items.map((item) => ({ ...item }));
    this.write(this.CART_KEY, all);
  }

  addToCart(userId: string, product: StoreProduct, qty = 1): void {
    const cart = this.getCart(userId);
    const existing = cart.find((item) => item.productId === product.id);
    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        productId: product.id,
        name: product.name,
        image: product.image,
        unitPrice: product.price,
        oldPrice: product.oldPrice,
        qty,
        deliveryLabel: product.deliveryLabel
      });
    }
    this.setCart(userId, cart.filter((item) => item.qty > 0));
  }

  updateCartQty(userId: string, productId: string, qty: number): void {
    const cart = this.getCart(userId)
      .map((item) => (item.productId === productId ? { ...item, qty } : item))
      .filter((item) => item.qty > 0);
    this.setCart(userId, cart);
  }

  removeFromCart(userId: string, productId: string): void {
    const cart = this.getCart(userId).filter((item) => item.productId !== productId);
    this.setCart(userId, cart);
  }

  cartCount(userId: string): number {
    return this.getCart(userId).reduce((sum, item) => sum + item.qty, 0);
  }

  cartSubtotal(userId: string): number {
    return this.getCart(userId).reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  }

  checkout(userId: string, subscription: 'none' | 'monthly' | 'quarterly' = 'none'): { success: boolean; error?: string } {
    const items = this.getCart(userId);
    if (!items.length) return { success: false, error: 'Your cart is empty.' };

    this.data.placeOrder({
      patientId: userId,
      items: items.map((item) => ({ name: item.name, qty: item.qty })),
      subscription
    });

    this.data.createNotification(
      userId,
      'medicine',
      'Order placed',
      'Your storefront order was placed successfully.',
      ['inApp', 'email']
    );

    this.setCart(userId, []);
    return { success: true };
  }

  async saveContactSubmission(payload: Omit<ContactSubmission, 'id' | 'createdAt'>): Promise<ContactSubmission> {
    const saved = await firstValueFrom(
      this.http.post<{ item: ContactSubmission }>('/api/contact', payload)
    );
    return saved.item;
  }

  saveContactSubmissionOffline(payload: Omit<ContactSubmission, 'id' | 'createdAt'>): ContactSubmission {
    const list = this.read<ContactSubmission[]>(this.CONTACT_KEY, []);
    const item: ContactSubmission = {
      ...payload,
      id: `contact_${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    list.push(item);
    this.write(this.CONTACT_KEY, list);
    if (payload.userId) {
      this.data.createNotification(
        payload.userId,
        'general',
        'Contact request received',
        'Your message has been submitted. Our team will reach out soon.',
        ['inApp']
      );
    }
    return item;
  }

  async subscribeNewsletter(email: string, userId?: string): Promise<{ success: boolean; duplicate?: boolean }> {
    try {
      await firstValueFrom(
        this.http.post<{ success: boolean; duplicate?: boolean }>(
          '/api/newsletter',
          { email: String(email || '').trim().toLowerCase(), userId }
        )
      );
      return { success: true };
    } catch (err: any) {
      if (Number(err?.status || 0) === 409) return { success: false, duplicate: true };
      return { success: false };
    }
  }

  subscribeNewsletterOffline(email: string, userId?: string): { success: boolean; duplicate?: boolean } {
    const list = this.read<Array<{ email: string; createdAt: string; userId?: string }>>(this.NEWSLETTER_KEY, []);
    const normalized = String(email || '').trim().toLowerCase();
    if (list.some((item) => item.email === normalized)) return { success: false, duplicate: true };
    list.push({ email: normalized, userId, createdAt: new Date().toISOString() });
    this.write(this.NEWSLETTER_KEY, list);
    return { success: true };
  }

  getBlogPosts(): BlogPost[] {
    const seeded = this.seedBlogIfMissing();
    return seeded.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getBlogPost(id: string): BlogPost | undefined {
    return this.getBlogPosts().find((item) => item.id === id);
  }

  private seedBlogIfMissing(): BlogPost[] {
    const existing = this.read<BlogPost[]>(this.BLOG_KEY, []);
    if (existing.length > 0) return existing;

    const seed: BlogPost[] = [
      {
        id: 'ayurveda-daily-routine',
        title: 'Ayurvedic Daily Routine for Better Immunity',
        excerpt: 'A practical dinacharya flow to support digestion, sleep, and immunity.',
        content:
          'Begin with warm water, align meals with digestive fire, include mindful movement, and wind down early. Consistency is the core principle behind Ayurvedic recovery and prevention.',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        author: 'Ayustura Care Team'
      },
      {
        id: 'seasonal-ayurveda-guide',
        title: 'Seasonal Ayurveda: What to Change in Your Diet',
        excerpt: 'How food choices shift with weather and dosha fluctuations.',
        content:
          'Ayurveda emphasizes adapting diet by season. Favor lighter foods in warmer months and nourishing, grounding foods in colder months to maintain dosha balance.',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        author: 'Ayustura Doctors'
      },
      {
        id: 'stress-relief-herbs',
        title: 'Herbs Commonly Used for Stress Relief',
        excerpt: 'Understanding traditional uses of Brahmi, Ashwagandha, and Jatamansi.',
        content:
          'Stress support in Ayurveda combines herbs, breath-work, sleep hygiene, and meal regularity. Clinical supervision is recommended for individualized and safe use.',
        createdAt: new Date(Date.now() - 86400000 * 9).toISOString(),
        author: 'Ayustura Research Desk'
      }
    ];

    this.write(this.BLOG_KEY, seed);
    return seed;
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // noop
    }
  }

}
