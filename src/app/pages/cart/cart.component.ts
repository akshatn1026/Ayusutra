import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { StorefrontService, CartItem } from '../../services/storefront.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-cart',
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.scss']
})
export class CartComponent implements OnInit {
  items: CartItem[] = [];
  loading = true;

  constructor(
    private auth: AuthService,
    private router: Router,
    private store: StorefrontService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    if (!user) {
      void this.router.navigate(['/login'], { queryParams: { redirected: 'true', returnUrl: '/cart' } });
      return;
    }
    this.items = this.store.getCart(user.id);
    this.loading = false;
  }

  updateQty(item: CartItem, nextQty: number): void {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    this.store.updateCartQty(user.id, item.productId, nextQty);
    this.items = this.store.getCart(user.id);
  }

  remove(item: CartItem): void {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    this.store.removeFromCart(user.id, item.productId);
    this.items = this.store.getCart(user.id);
    this.toast.show('Item removed from cart.', 'info');
  }

  checkout(): void {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    const result = this.store.checkout(user.id, 'none');
    if (!result.success) {
      this.toast.show(result.error || 'Unable to checkout.', 'warning');
      return;
    }
    this.items = [];
    this.toast.show('Checkout completed. Your order has been placed.', 'success');
    void this.router.navigate(['/orders']);
  }

  get subtotal(): number {
    const user = this.auth.getCurrentUser();
    if (!user) return 0;
    return this.store.cartSubtotal(user.id);
  }
}
