import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService, User } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { StoreProduct, StorefrontService } from '../../services/storefront.service';

interface CategoryItem {
  title: string;
  image: string;
}

interface BenefitItem {
  title: string;
  description: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  expandedFaqIndex = 0;
  showPagesMenu = false;
  loadingProducts = false;

  categories: CategoryItem[] = [];
  products: StoreProduct[] = [];
  filteredProducts: StoreProduct[] = [];

  searchTerm = '';
  activeCategory = '';
  discountOnly = false;
  cartCount = 0;

  contactModel = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  };

  newsletterEmail = '';

  readonly whatWeDo: BenefitItem[] = [
    { title: 'Herbal Remedies', description: 'We provide authentic Ayurvedic products made from pure herbs and natural ingredients.' },
    { title: 'Personalized Ayurvedic', description: 'Our expert practitioners offer personalized wellness plans based on Ayurvedic principles.' },
    { title: 'Rejuvenation Therapies', description: 'Experience Panchakarma, herbal detox, and revitalizing therapies for complete wellness.' },
    { title: 'Immunity Solutions', description: 'Strengthen your immunity and overall health with time-tested Ayurvedic formulations.' },
    { title: 'Ayurvedic Skincare', description: 'Natural skincare solutions using herbal oils, face packs, scrubs, and nourishing treatments.' },
    { title: 'Stress Relief', description: 'Holistic remedies, meditation, and Ayurvedic therapies for stress and relaxation.' }
  ];

  readonly featuredLeft: string[] = ['Improves Brain Function', 'Balances Hormones', 'Promotes Better Sleep'];

  readonly featuredRight: string[] = ['Reduces Stress & Anxiety', 'Boosts Energy & Stamina', 'Supports Immunity'];

  readonly faqs: FaqItem[] = [
    {
      question: 'What is Ayurveda and how does it work?',
      answer:
        'Ayurveda is an ancient holistic healing system from India that focuses on balancing the mind, body, and spirit using natural herbs, diet, and lifestyle practices.'
    },
    {
      question: 'Are Ayurvedic products safe to use?',
      answer: 'When sourced from trusted providers and used correctly, Ayurvedic products are generally safe and effective.'
    },
    {
      question: 'How long does it take for Ayurvedic treatments to show results?',
      answer: 'Results depend on your body type and condition, but many users report steady improvement within a few weeks.'
    },
    {
      question: 'Are Ayurvedic products suitable for all age groups?',
      answer: 'Most products can be adapted to different age groups with correct dosage guidance from experts.'
    },
    {
      question: 'Can I take Ayurvedic supplements along with my regular medicines?',
      answer: 'Yes in many cases, but always consult your healthcare provider before combining treatments.'
    },
    {
      question: 'Do Ayurvedic products have any side effects?',
      answer: 'Quality products used properly have minimal side effects. Avoid self-medication and follow professional advice.'
    }
  ];

  private querySub?: Subscription;
  private authSub?: Subscription;

  constructor(
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private storefront: StorefrontService,
    private toast: ToastService
  ) {}

  async ngOnInit(): Promise<void> {
    this.currentUser = this.auth.getCurrentUser();
    this.authSub = this.auth.currentUser$.subscribe((user) => {
      this.currentUser = user;
      this.refreshCartCount();
    });

    await this.loadCategories();

    this.querySub = this.route.queryParamMap.subscribe((params) => {
      this.activeCategory = params.get('category') || '';
      this.discountOnly = params.get('discount') === '1';
      this.searchTerm = params.get('q') || '';
      void this.loadProductsFromBackend();
    });

    this.refreshCartCount();
  }

  ngOnDestroy(): void {
    if (this.querySub) this.querySub.unsubscribe();
    if (this.authSub) this.authSub.unsubscribe();
  }

  goHome(): void {
    void this.router.navigate(['/home']);
  }

  goShop(): void {
    void this.router.navigate(['/home'], { fragment: 'products' });
  }

  goDiscounts(): void {
    void this.router.navigate(['/home'], { queryParams: { discount: 1 }, fragment: 'products' });
  }

  goAbout(): void {
    void this.router.navigate(['/about']);
  }

  goBlog(): void {
    void this.router.navigate(['/blog']);
  }

  goBuyNow(): void {
    if (!this.currentUser) {
      void this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/checkout' } });
      return;
    }
    const userCart = this.storefront.getCart(this.currentUser.id);
    if (!userCart.length && this.filteredProducts.length) {
      this.storefront.addToCart(this.currentUser.id, this.filteredProducts[0], 1);
    }
    this.refreshCartCount();
    void this.router.navigate(['/cart']);
  }

  openProfileOrDashboard(): void {
    if (!this.currentUser) {
      void this.router.navigate(['/forgot-password']);
      return;
    }
    const target = this.currentUser.role === 'doctor' ? '/doctor/dashboard' : '/dashboard';
    void this.router.navigate([target]);
  }

  navigatePage(path: string): void {
    this.showPagesMenu = false;
    void this.router.navigate([path]);
  }

  applySearch(): void {
    const params: Record<string, string | number | null> = {
      q: this.searchTerm.trim() || null,
      category: this.activeCategory || null,
      discount: this.discountOnly ? 1 : null
    };
    void this.router.navigate(['/home'], { queryParams: params, queryParamsHandling: '' });
  }

  filterByCategory(category: string): void {
    const selected = this.activeCategory === category ? '' : category;
    void this.router.navigate(['/home'], {
      queryParams: {
        category: selected || null,
        q: this.searchTerm.trim() || null,
        discount: this.discountOnly ? 1 : null
      },
      fragment: 'products'
    });
  }

  openProduct(product: StoreProduct): void {
    void this.router.navigate(['/herbs', encodeURIComponent(product.id)]);
  }

  addToCart(product: StoreProduct): void {
    if (!this.currentUser) {
      this.toast.show('Please login to add items to cart.', 'info');
      void this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/home' } });
      return;
    }
    this.storefront.addToCart(this.currentUser.id, product, 1);
    this.refreshCartCount();
    this.toast.show(`${product.name} added to cart.`, 'success');
  }

  setFaq(index: number): void {
    this.expandedFaqIndex = this.expandedFaqIndex === index ? -1 : index;
  }

  async submitContact(): Promise<void> {
    const email = String(this.contactModel.email || '').trim();
    if (!this.contactModel.firstName.trim() || !email || !this.contactModel.message.trim()) {
      this.toast.show('Please complete required contact fields.', 'warning');
      return;
    }
    if (!this.isValidEmail(email)) {
      this.toast.show('Please enter a valid email address.', 'warning');
      return;
    }

    try {
      await this.storefront.saveContactSubmission({
        ...this.contactModel,
        email,
        userId: this.currentUser?.id
      });
    } catch {
      this.storefront.saveContactSubmissionOffline({
        ...this.contactModel,
        email,
        userId: this.currentUser?.id
      });
    }

    this.contactModel = {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      subject: '',
      message: ''
    };
    this.toast.show('Contact request submitted successfully.', 'success');
  }

  async submitNewsletter(): Promise<void> {
    const email = String(this.newsletterEmail || '').trim().toLowerCase();
    if (!this.isValidEmail(email)) {
      this.toast.show('Please enter a valid email.', 'warning');
      return;
    }
    let result: { success: boolean; duplicate?: boolean };
    try {
      result = await this.storefront.subscribeNewsletter(email, this.currentUser?.id);
    } catch {
      result = this.storefront.subscribeNewsletterOffline(email, this.currentUser?.id);
    }
    if (result.duplicate) {
      this.toast.show('This email is already subscribed.', 'info');
      return;
    }
    if (!result.success) {
      this.toast.show('Unable to subscribe right now. Please try again.', 'warning');
      return;
    }
    this.newsletterEmail = '';
    this.toast.show('Newsletter subscription successful.', 'success');
  }

  scrollTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  startConsultation(): void {
    if (!this.currentUser) {
      void this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/consult' } });
      return;
    }
    void this.router.navigate(['/consult']);
  }

  startDoshaAssessment(): void {
    if (!this.currentUser) {
      void this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/dosha-assessment' } });
      return;
    }
    void this.router.navigate(['/dosha-assessment']);
  }

  private refreshCartCount(): void {
    if (!this.currentUser) {
      this.cartCount = 0;
      return;
    }
    this.cartCount = this.storefront.cartCount(this.currentUser.id);
  }

  private async loadCategories(): Promise<void> {
    const categoryImages: Record<string, string> = {
      'Herbal products': 'https://images.unsplash.com/photo-1615485925600-97237c4fc1ec?auto=format&fit=crop&w=280&q=80',
      'Digestive Health': 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?auto=format&fit=crop&w=280&q=80',
      'Immunity Boosters': 'https://images.unsplash.com/photo-1628771065518-0d82f1938462?auto=format&fit=crop&w=280&q=80',
      'Stress Support': 'https://images.unsplash.com/photo-1611078489935-0cb964de46d6?auto=format&fit=crop&w=280&q=80',
      'Skin Hair Care': 'https://images.unsplash.com/photo-1616627457334-5dce7d48c7f7?auto=format&fit=crop&w=280&q=80',
      'Detox Rejuvenation': 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=280&q=80',
      'Heart Health': 'https://images.unsplash.com/photo-1543362906-acfc16c67564?auto=format&fit=crop&w=280&q=80',
      'Diabetes Care': 'https://images.unsplash.com/photo-1607619056584-7b8d3ee536b2?auto=format&fit=crop&w=280&q=80'
    };
    try {
      const ordered = await this.storefront.getCategories();
      this.categories = ordered.map((title) => ({
        title,
        image: categoryImages[title] || categoryImages['Herbal products']
      }));
    } catch {
      const ordered = Object.keys(categoryImages);
      this.categories = ordered.map((title) => ({ title, image: categoryImages[title] }));
    }
  }

  private async loadProductsFromBackend(): Promise<void> {
    this.loadingProducts = true;
    try {
      this.products = await this.storefront.getProducts({
        q: this.searchTerm.trim(),
        category: this.activeCategory,
        discountOnly: this.discountOnly
      });
      this.filteredProducts = [...this.products];
    } catch {
      this.filteredProducts = [];
      this.toast.show('Unable to load products right now.', 'warning');
    } finally {
      this.loadingProducts = false;
    }
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
