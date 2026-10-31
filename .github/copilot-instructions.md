# Copilot Instructions

## Project

Mona Mayhem is a retro arcade GitHub Contribution Battle Arena. The goal is to compare GitHub contribution activity in an engaging battle-style experience.

## Stack and commands

- Use Astro with JavaScript or TypeScript. Prefer TypeScript for typed APIs and other code where it improves clarity.
- Style with Tailwind CSS when it is configured, or Astro component-scoped CSS.
- `npm run dev` starts the development server.
- `npm run build` creates the production build.
- `npm run preview` previews the production build.

## Implementation guidelines

- Follow Astro conventions: pages and routes belong under `src/pages/`; use `.astro` files for Astro pages and components.
- Keep components and modules focused and modular. Follow existing file naming and project patterns.
- Favor clean, readable code over clever abstractions. Avoid adding unnecessary dependencies or abstractions.
- Preserve type safety and handle API errors explicitly; do not return success-shaped data for failures.
- Keep client-side JavaScript limited to interactions that require it.
