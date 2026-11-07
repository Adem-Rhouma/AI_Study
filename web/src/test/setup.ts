import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

// jsdom has no layout engine; components that measure elements need these stubs.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  })
});

class RecordingObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

// jsdom has neither observer; Radix mounts them in layout effects and an uncaught throw there
// unmounts the tree under test.
for (const name of ['ResizeObserver', 'IntersectionObserver'] as const) {
  if (!(name in window)) {
    Object.defineProperty(window, name, { writable: true, value: RecordingObserver });
  }
}

if (!window.scrollTo) {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
}

// jsdom lays nothing out, so scrollIntoView is missing rather than a no-op. Panels that follow the
// newest turn would throw in their scroll effect.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
