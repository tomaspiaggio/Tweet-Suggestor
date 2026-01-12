# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

This project uses **Bun** as the runtime and package manager.

```bash
bun install              # Install dependencies
bun run index.ts         # Run main script
npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix linting issues
npm run typecheck        # TypeScript type checking (no emit)
npm run test             # Run all tests
npm run test:youtube     # Run YouTube scraper tests only
npm run test:twitter     # Run Twitter scraper tests only
```

## Architecture

**Personal news aggregator** that scrapes content from video sources using Apify.

### Key Patterns

**Error Handling**: Uses `neverthrow` for functional error handling. All async operations return `ResultAsync<T, Error>` instead of throwing exceptions. Chain with `.map()` and `.andThen()`.

**Validation**: Zod schemas validate data at runtime. Define schemas, infer TypeScript types from them.

**Scrapers**: Located in `scrapers/`. Each scraper module exports batch functions that:
- Accept arrays of URLs
- Use Apify actors for scraping
- Validate responses against Zod schemas
- Return `ResultAsync` types

### Core Dependencies

- **apify-client**: Web scraping via Apify platform
- **neverthrow**: Result types for error handling
- **zod**: Runtime schema validation

## Environment

Requires `APIFY_API_KEY` in `.env` file.
