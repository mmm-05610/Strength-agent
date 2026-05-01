# Fitness Agent Frontend Design Rules

## 1. Visual Theme and Atmosphere

- Theme: Athletic control room (light edition).
- Feel: Data-dense, optimistic, and coach-like.
- Background uses soft blue-white gradient with warm highlight.

## 2. Color Palette and Roles

- Brand blue is for primary actions and selected navigation.
- Orange is reserved for emphasis and warning hotspots.
- Red is only for danger or blocked states.
- Body text uses deep slate on white/light cards.

## 3. Typography Rules

- Use Chivo for all UI text and headings.
- Use IBM Plex Mono only for machine output and API/raw payload blocks.
- Keep headings short and scannable.

## 4. Component Stylings

- Cards: rounded, medium border, soft inner highlight.
- Inputs: stable height and clear focus ring.
- Buttons: strong color fill and slight lift on hover.
- Status badges: compact pill style with semantic colors.
- Sidebar navigation: always visible on desktop, collapses to top menu on narrow screens.

## 5. Layout Principles

- Desktop: left sidebar plus page workspace.
- Home page: preview cards first, then two chart cards, then AI recommendation block.
- Mobile: sidebar becomes top menu and pages stay single-column.

## 6. Depth and Elevation

- Use low blur shadows for depth.
- Add one inner stroke to cards for structure.
- Avoid heavy blur or glossy effects.

## 7. Do and Dont

- Do keep action buttons in predictable locations.
- Do preserve field labels for rapid data entry.
- Do not mix multiple visual themes in one view.
- Do not use decorative colors for critical metrics.

## 8. Responsive Behavior

- Collapse to top-menu layout below 1080px.
- Maintain touch targets at 40px minimum height.
- Keep status badges and menu items wrapping gracefully.

## 9. Agent Prompt Guide

- Prefer concise labels and measurable language.
- Render key metrics first, details second.
- For AI recommendation blocks, use mono text area and preserve line breaks.
- Always keep color semantics consistent across all pages.
