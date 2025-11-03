import type { WishComposerProps as WishComposerPropsType } from '@/components/WishComposer';

declare global {
  // Provide ambient access for legacy modules that reference WishComposerProps without importing it.
  type WishComposerProps = WishComposerPropsType;
}

export {};
