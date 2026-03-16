import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { setRuntimeConfig } from './app/core/config/runtime-config';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

async function bootstrap(): Promise<void> {
  try {
    const response = await fetch('/assets/runtime-config.json', { cache: 'no-store' });
    if (response.ok) {
      setRuntimeConfig(await response.json());
    }
  } catch (error) {
    console.warn('Runtime config could not be loaded. Falling back to compiled defaults.', error);
  }

  platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
}

void bootstrap();
