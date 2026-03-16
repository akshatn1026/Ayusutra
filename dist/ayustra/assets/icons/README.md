# AYUSUTRA Icon System

## Overview
Professional medical + wellness fusion iconography system for the Ayurvedic healthcare platform.

## Icon Specifications
- **Format:** SVG (scalable, high-quality)
- **Stroke Width:** 1.5px (consistent medical aesthetic)
- **Stroke Cap:** Rounded (medical + friendly)
- **Stroke Join:** Rounded (smooth, professional)
- **Colors:** Use CSS classes for color mapping
- **Sizes:** Responsive (16px-64px via CSS classes)

## Treatment Icons

### 1. Panchakarma (5-Fold Therapy)
**File:** `treatments/panchakarma.svg`
**Color Class:** `.icon-panchakarma` (gradient: $primary → $accent)
**Use Case:** Main Panchakarma treatment card
**Description:** 5 points connected to center, representing 5-fold therapy

### 2. Digestive Wellness
**File:** `treatments/digestive.svg`
**Color Class:** `.icon-digestive` (color: $gold)
**Use Case:** Digestive health treatment card
**Description:** Stomach/digestive system outline

### 3. Mental Wellness
**File:** `treatments/mental.svg`
**Color Class:** `.icon-mental` (color: $accent)
**Use Case:** Mental health/stress relief card
**Description:** Brain meditation symbol

### 4. Skin Health
**File:** `treatments/skin.svg`
**Color Class:** `.icon-skin` (color: $sand)
**Use Case:** Skin rejuvenation card
**Description:** Skin cell / leaf hybrid design

### 5. Immunity Boost
**File:** `treatments/immunity.svg`
**Color Class:** `.icon-immunity` (color: $primary)
**Use Case:** Immunity enhancement card
**Description:** Shield + health symbol

### 6. Chronic Care
**File:** `treatments/chronic.svg`
**Color Class:** `.icon-chronic` (color: $primary-light)
**Use Case:** Chronic condition management card
**Description:** Holistic balance symbol

## Consultation Process Icons

### 1. Consultation
**File:** `consultation/consultation.svg`
**Color Class:** `.icon-consultation`
**Step:** Step 1 - Initial consultation
**Description:** Person + doctor interaction

### 2. Assessment
**File:** `consultation/assessment.svg`
**Color Class:** `.icon-assessment`
**Step:** Step 2 - Comprehensive assessment
**Description:** Clipboard / analysis

### 3. Treatment
**File:** `consultation/treatment.svg`
**Color Class:** `.icon-treatment`
**Step:** Step 3 - Personalized treatment
**Description:** Healing hands / wellness

### 4. Follow-up
**File:** `consultation/follow-up.svg`
**Color Class:** `.icon-follow-up`
**Step:** Step 4 - Continuous support
**Description:** Check mark + continuity arrow

## Usage in HTML

### Basic Icon Usage
```html
<!-- Inline SVG icon with size -->
<svg class="icon icon-lg icon-primary">
  <use xlink:href="assets/icons/treatments/panchakarma.svg#icon"></use>
</svg>

<!-- Or with img tag -->
<img src="assets/icons/treatments/panchakarma.svg" class="icon icon-lg" />

<!-- With background -->
<div class="icon-bg icon-bg-primary">
  <img src="assets/icons/treatments/digestive.svg" class="icon icon-lg" />
</div>
```

### In Treatment Cards
```html
<div class="treatment-card">
  <div class="treatment-icon">
    <svg class="icon icon-xl icon-digestive">
      <use xlink:href="assets/icons/treatments/digestive.svg"></use>
    </svg>
  </div>
  <h3>Digestive Wellness</h3>
  <p>Restore digestive fire and balance</p>
</div>
```

### In Consultation Steps
```html
<div class="step-item">
  <div class="step-circle">
    <svg class="icon icon-xl icon-white">
      <use xlink:href="assets/icons/consultation/consultation.svg"></use>
    </svg>
  </div>
  <h3>Free Consultation</h3>
  <p>Book your personalized session</p>
</div>
```

## CSS Color Mapping

### Treatment Icons
- **Panchakarma:** Gradient (primary → accent)
- **Digestive:** Gold ($gold)
- **Mental:** Sage green ($accent)
- **Skin:** Sandalwood ($sand)
- **Immunity:** Primary green ($primary)
- **Chronic:** Primary light ($primary-light)

### Icon Size Classes
```css
.icon-xs   { width: 16px; height: 16px; }  /* Small labels */
.icon-sm   { width: 20px; height: 20px; }  /* Navigation */
.icon-md   { width: 24px; height: 24px; }  /* Standard (default) */
.icon-lg   { width: 32px; height: 32px; }  /* Cards */
.icon-xl   { width: 48px; height: 48px; }  /* Large features */
.icon-2xl  { width: 64px; height: 64px; }  /* Hero icons */
```

### Icon Color Classes
```css
.icon-primary   { color: $primary; }           /* Herbal green */
.icon-accent    { color: $accent; }            /* Sage green */
.icon-gold      { color: $gold; }              /* Muted gold */
.icon-white     { color: white; }              /* Light on dark */
.icon-muted     { color: $text-muted; }        /* Subtle */
```

### Icon Background Variants
```css
.icon-bg              { background: rgba($accent, 0.12); }      /* Default */
.icon-bg-primary      { background: rgba($primary, 0.1); }      /* Herbal */
.icon-bg-accent       { background: rgba($accent, 0.12); }      /* Sage */
.icon-bg-gold         { background: rgba($gold, 0.1); }         /* Gold */
.icon-bg-sand         { background: rgba($sand, 0.1); }         /* Beige */
```

## Generation Guidelines

### Creating New Icons
1. **Design:** Use Figma, Illustrator, or XD
2. **Stroke:** Set to 1.5px with round caps/joins
3. **Grid:** Align to 24x24 grid
4. **Simplicity:** Minimal, recognizable at all sizes
5. **Export:** Save as optimized SVG
6. **Test:** Verify at multiple sizes (16px-64px)

### Optimization
1. Remove unnecessary attributes
2. Remove fill (let CSS control color)
3. Keep only `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`
4. Use `currentColor` for color inheritance

## Best Practices

✅ **DO:**
- Use consistent stroke width (1.5px)
- Round stroke caps and joins
- Keep icons simple and clear
- Test at multiple sizes
- Use semantic naming
- Provide fallback images

❌ **DON'T:**
- Use filled icons (outline only)
- Mix stroke widths
- Create complex details
- Use gradients in icons
- Assume one size fits all

## Accessibility

- Icons include `aria-label` for screen readers
- Color not the only indicator (text labels present)
- Sufficient contrast maintained
- Icons are supplementary (not essential alone)

## Animation (Optional)

```css
.icon:hover {
  transform: scale(1.1) rotate(5deg);
  transition: all 280ms ease;
}

.icon.pulse {
  animation: float-gentle 4s ease-in-out infinite;
}
```

## File Structure
```
src/assets/icons/
├── treatments/
│   ├── panchakarma.svg
│   ├── digestive.svg
│   ├── mental.svg
│   ├── skin.svg
│   ├── immunity.svg
│   └── chronic.svg
├── consultation/
│   ├── consultation.svg
│   ├── assessment.svg
│   ├── treatment.svg
│   └── follow-up.svg
└── benefits/
    └── (future icons)
```

## Performance

- **Format:** SVG (infinitely scalable)
- **Size:** ~1-2KB per icon
- **Optimization:** SVGO tool used for minification
- **Caching:** Set Cache-Control headers
- **Lazy Load:** Load on demand

## Browser Support

- All modern browsers (Chrome, Firefox, Safari, Edge)
- IE11+ with fallback PNG
- Mobile browsers fully supported
- Responsive sizing with CSS

## Examples

### Treatment Card with Icon
```html
<div class="treatment-card">
  <div class="icon-bg icon-bg-gold">
    <svg class="icon icon-xl icon-digestive">
      <!-- Icon content -->
    </svg>
  </div>
  <h3>Digestive Wellness</h3>
  <p>Balance your digestive fire</p>
  <span class="badge-sm">Session: 60 min</span>
</div>
```

### Consultation Step with Icon
```html
<div class="step-item">
  <div class="step-circle" style="background: linear-gradient(135deg, $accent, $accent-light)">
    <svg class="icon icon-xl icon-white">
      <!-- Icon content -->
    </svg>
  </div>
  <h3>Personalized Assessment</h3>
  <p>Dr. evaluates your health condition</p>
</div>
```

### Footer Social Icons
```html
<div class="social-links">
  <a href="#" class="icon-social">
    <svg class="icon icon-lg">📘</svg>
  </a>
  <a href="#" class="icon-social">
    <svg class="icon icon-lg">🐦</svg>
  </a>
</div>
```

## Future Enhancements

- [ ] Animated icons (loading spinners, progress)
- [ ] Icon variants (filled, dual-tone)
- [ ] Category icons (blog, articles)
- [ ] Testimonial icons
- [ ] Seasonal/wellness theme icons
- [ ] Dark mode icon variants

---

**All icons are created with premium medical + wellness aesthetics in mind.**
**Perfect for healthcare, wellness, and Ayurvedic platforms.**
