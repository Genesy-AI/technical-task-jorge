<p align="center">
  <img src="./enginy_brand_filled.svg" width="256" height="128" alt="Enginy logo">
</p>

## Overview

Welcome to the **TinyEnginy** take‑home! This exercise is a condensed version of our product and day‑to‑day work. Please treat the codebase as if it were the one you ship to production.


## What you’ll do (at a glance)

These tasks are independent — tackle them in whatever order you consider most important or impactful.

- **Bug fix:** CSV import displays invalid country codes.
- **Bug fix:** Email verification hangs indefinitely with no feedback.
- **Feature:** Add new lead data fields (phone number, years at company, LinkedIn).
- **Feature:** Implement an enrich phone workflow using Temporal.
- **PR Review:** Review an open pull request from a teammate.
- **Analysis:** Propose codebase improvements and a technical roadmap.

## Submission

Please record your screen (and, if possible, your voice) while you work on this task [(opensource tool)](https://cap.so/). We want to see how you collaborate with AI tools, how you reason through trade-offs, and how far you can get within the timebox. Feel free to get comfortable with the project first — set things up, explore the codebase, and understand how it all fits together before you start recording.

The expected work time is between 1 and 2 hours. Do not worry if you cannot complete every part of the task. Work in the repository as you see fit, and when you are done, just ping us. We value the time you invest in this task, and we commit to spending a similar amount reviewing it thoroughly. Regardless of the outcome, we’ll provide constructive feedback so you can benefit from the evaluation.


## Getting Started

### Prerequisites

- **[Node.js](https://nodejs.org/)** (use the version in .nvmrc).

- **[pnpm](https://pnpm.io/)** package manager.

- **[SQLite](https://www.sqlite.org/)** (bundled; no separate install required).

- **[Temporal](https://docs.temporal.io/)** — Workflow management system.

- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)** installed locally, with the provided `ANTHROPIC_API_KEY` configured. If you are more comfortable, you can use any other AI coding tool you have access to.

Install tools:

- Node via nvm: https://github.com/nvm-sh/nvm#installing-and-updating

- pnpm: https://pnpm.io/installation#using-other-package-managers

- Temporal: https://docs.temporal.io/develop/typescript/set-up-your-local-typescript

- Claude Code: https://docs.anthropic.com/en/docs/claude-code/overview

### Environment setup

Set the provided `ANTHROPIC_API_KEY` in your shell before running the project:

```zsh
export ANTHROPIC_API_KEY="your-provided-key"
```

**Backend (one‑time)**

```zsh
cd backend
nvm use                   # Ensure the Node version from .nvmrc
pnpm install              # Install dependencies (also creates .env from .env.sample)
pnpm migrate:dev          # Sync local SQLite with Prisma schema
pnpm gen:prisma           # Generate Prisma client
temporal server start-dev # Starts Temporal server
```

**Backend (develop)**

```zsh
cd backend
pnpm run dev           # Starts the API server
```

When you change the [Prisma](https://www.prisma.io/docs) schema:
```zsh
pnpm migrate:dev
```

**Frontend (one‑time)**

```zsh
cd frontend
nvm use                # Ensure the Node version from .nvmrc
pnpm install
```

**Frontend (develop)**

```zsh
cd frontend
pnpm run dev           # Starts the dev server
```

## Task Description

### Bug: CSV country codes

When importing leads from CSV using the example file, the country column displays garbled characters instead of valid country codes.

### Bug: Email verification stalls

The email verification process hangs indefinitely for some leads and never reports a success or failure outcome.

### Feature: New lead fields

Add three new data points for leads: **phone number**, **years at current company**, and **LinkedIn profile URL**.

Users should be able to:

 - See these fields in the leads table
 - Set them via CSV import
 - Use them in message composition

Since the field list will keep growing, the message composition UX needs to scale accordingly (no design provided).

### Feature: Enrich phone

Implement a [**Temporal**](https://docs.temporal.io/) workflow that finds a lead's phone number by querying three providers in sequence:

1. Call **Provider One** → if no phone found,  
2. Call **Provider Two** → if no phone found,  
3. Call **Provider Three** → if no phone found, mark as **No data found**.

#### Requirements
- Each provider call is an **activity** with:
  - Short timeout
  - Retry policy (e.g. 3 attempts, exponential backoff)
- Stop early when a phone is found.
- Idempotent workflow (only one per lead).
- Abstraction layer to handle different provider inputs.
- Show process feedback to the user
- Update frontend accordingly

#### Nice to have

Take into account provider rate limits, right now they have unlimited RPS/RPM, however they told us they will add rate limits to their endpoints.


#### Provider APIs

**Orion Connect**
> Provider with the best data in the market, but slow and fails sometimes
>
> Base URL: `https://api.enginy.ai/api/tmp/orionConnect`
>
> Request: `{ "fullName": "Ada Lovelace", "companyWebsite": "example.com" }`
>
> Authentication: `Request header 'x-auth-me' with key 'mySecretKey123'`
>
> Response: `POST { "phone": string | null }`

**Astra Dialer**
> Provider with the worst data in the market, but is the fastest one
>
> Base URL: `https://api.enginy.ai/api/tmp/astraDialer`
>
> Request: `POST { "email": "john.doe@example.com" }`
>
> Authentication: `Request header 'apiKey' with key '1234jhgf'`
>
> Response: `{ "phoneNmbr": string | null | undefined }`

**Nimbus Lookup**
> New provider in the market
>
> Base URL: `https://api.enginy.ai/api/tmp/numbusLookup`
>
> Request: `POST { "email": "john.doe@example.com", jobTitle: "CTO" }`
>
> Authentication: `Get parameter 'api' with key '000099998888'`
>
> Response: `{ "number": number, "countryCode": "string" }`

### PR review

Review the open PR as if it were from a teammate. Leave inline comments where relevant and provide a summary with a clear approve or request-changes decision.

### Codebase Analysis & Roadmap

Create an `IMPROVEMENTS.md` file as if it were a document in our project management tool.

## Evaluation

You won’t be evaluated on producing a single predefined _correct solution_, but rather on your problem-solving skills, the product mindset you showcase, your ability to reason and explain your thought process, the trade-offs behind your decisions, and how you managed to use AI tools.