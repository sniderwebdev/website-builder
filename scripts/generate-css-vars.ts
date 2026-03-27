#!/usr/bin/env tsx
/**
 * Reads brand.config.ts and writes CSS custom properties to
 * apps/storefront/src/styles/globals.css and apps/admin/src/styles/globals.css
 */
import brand from '../brand.config'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

function generateCss(config: typeof brand): string {
  return `:root {
  /* Colors */
  --color-primary: ${config.colors.primary};
  --color-secondary: ${config.colors.secondary};
  --color-accent: ${config.colors.accent};
  --color-background: ${config.colors.background};
  --color-surface: ${config.colors.surface};
  --color-text: ${config.colors.text};
  --color-text-muted: ${config.colors.textMuted};
  --color-border: ${config.colors.border};
  --color-error: ${config.colors.error};
  --color-success: ${config.colors.success};

  /* Typography */
  --font-heading: ${config.fonts.heading};
  --font-body: ${config.fonts.body};${config.fonts.mono ? `\n  --font-mono: ${config.fonts.mono};` : ''}

  /* Shape */
  --radius: ${config.borderRadius};
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-body);
  background-color: var(--color-background);
  color: var(--color-text);
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
}
`
}

const css = generateCss(brand)

const targets = [
  'apps/storefront/src/styles/globals.css',
  'apps/admin/src/styles/globals.css',
]

for (const target of targets) {
  const dir = join(process.cwd(), target.split('/').slice(0, -1).join('/'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(process.cwd(), target), css, 'utf-8')
  console.log(`✓ Written: ${target}`)
}
