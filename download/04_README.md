# FinWise — Personal Finance Intelligence

> An agentic AI personal finance copilot built for the PBCSF International Track Topic A. FinWise doesn't just display your financial data — it actively reasons about it, adds transactions via natural language, runs Monte Carlo simulations, and surfaces personalized insights.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Architecture](#architecture)
- [Agent Tools](#agent-tools)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Security](#security)
- [Testing](#testing)
- [Deployment](#deployment)
- [Competition Submission](#competition-submission)

## Overview

FinWise is a Next.js 16 web application that implements an agentic AI system for personal finance management. The core is a supervisor-worker agent pattern with 11 tools (7 read + 4 write) that can both query and modify financial data through natural language conversation.

The app includes 8 views (Overview, Transactions, Budgets, Goals, Planning, Insights, Analytics, Innovation Lab) with 20+ sophisticated features including Monte Carlo simulation, Holt-Winters forecasting, Financial Health Score, Behavioral Trigger Detection, and 5 novel innovation features.

## Features

### Core Finance Features
- **Smart Budgeting** — Envelope-based budgets with spend tracking, over-budget alerts, and edit-in-place
- **Bill Analysis** — CSV import with auto-categorization, receipt OCR (simulated), recurring payment detection
- **Spending Insights** — Category treemap, monthly trend area chart, anomaly detection, month-over-month deltas
- **Actionable Recommendations** — Rule-engine generated with dollar impact, confidence scores, and accept/dismiss tracking
- **Savings Goals** — Progress tracking with radial gauges, Monte Carlo simulation, compound growth projections

### Agent Capabilities (Natural Language)
- **Add Transaction** — "I spent $42 on groceries at Trader Joe's"
- **Create Goal** — "Create a goal to save $8000 for a vacation"
- **Update Budget** — "Set my dining budget to $400"
- **Delete Transaction** — "Delete my last transaction"
- **Monthly Review** — "How did this month go?"
- **Run Simulation** — "If I cut dining by 20%, when can I afford the Japan trip?"

### Advanced Analytics
- **Financial Health Score** — Composite 0-100 metric with 5 weighted subscores
- **Spend Velocity** — Current-month pace tracking with projected over/under budget
- **14-Day Cash Flow Forecast** — Holt-Winters triple exponential smoothing with confidence bands
- **What-If Scenario Builder** — Interactive sliders for savings, expenses, and investment return
- **365-Day Spending Heatmap** — GitHub-style calendar grid
- **5-Year Monte Carlo** — 500 trials with histogram and percentile distribution
- **Seasonal Decomposition** — Additive model (trend + seasonal + residual)
- **Savings Goal Optimizer** — LP-style greedy allocation (snowball strategy)
- **Merchant Concentration Index** — Herfindahl-Hirschman Index (HHI)
- **Financial Stress Index** — Multi-factor composite risk score

### Innovation Lab (5 Novel Features)
- **Financial Personality DNA** — 5 archetypes: Architect, Free Spirit, Climber, Guardian, Explorer
- **Future Self Simulator** — Age milestone projections (30/40/50/65/80) with FIRE tracking
- **Behavioral Trigger Detection** — Day-of-week, payday proximity, time-of-day, category clustering
- **Time-Value Calculator** — Converts spending to hours worked + 30-year opportunity cost
- **Goal Collision Detector** — Multi-goal constraint solver with severity classification

### Planning Tools
- **Debt Payoff Planner** — Avalanche vs Snowball with monthly simulation and comparison
- **Bill Schedule** — Coverage ratio analysis with urgency grouping (overdue/due soon/due later)
- **Smart Insights Feed** — AI-curated daily action items with priority sorting and CTAs
- **Export** — CSV download and JSON summary report

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js 16 (App Router) | 16.x |
| Language | TypeScript 5 | 5.x |
| Styling | Tailwind CSS 4 + shadcn/ui | 4.x |
| Database | Prisma ORM + SQLite | 6.x |
| LLM | Z.ai Web Dev SDK | 0.0.18 |
| Charts | Recharts | 2.15 |
| Icons | Lucide React | 0.525 |
| State | React hooks + lazy fetch | — |

## Getting Started

### Prerequisites

- Node.js 18+ (or Bun)
- npm/bun package manager

### Installation

```bash
# Clone the repository
git clone <your-github-repo-url>
cd finwise

# Install dependencies
bun install  # or npm install

# Set up the database
bun run db:push  # or npx prisma db push

# Start the development server
bun run dev  # or npm run dev
```

The app will be available at `http://localhost:3000`.

### First Run

On first load, the app automatically seeds the database with:
- 12 months of synthetic transactions (~550 transactions across 9 categories)
- 3 savings goals (Trip to Japan, Emergency Fund, New Laptop)
- 5 pre-generated recommendations
- 9 budget envelopes with realistic allocations

Click "Reset" in the header to regenerate the data at any time.

## Architecture

FinWise follows a 4-layer architecture:

```
┌─────────────────────────────────────────────────┐
│                Ingestion Layer                   │
│  CSV upload · Receipt OCR · Agent NL input      │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│              Categorization Layer                │
│  Rule-based matching · LLM-assisted · Auto-create│
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│                 Agent Layer                      │
│  Supervisor (intent router) → Workers (11 tools)│
│  → LLM synthesis with guardrails                 │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│                Insight Layer                     │
│  Rule engine · Monte Carlo · Holt-Winters · HHI │
│  · Financial Health Score · Stress Index        │
└─────────────────────────────────────────────────┘
```

### Agent Architecture

The agent uses a supervisor-worker pattern:

1. **Supervisor (Intent Router)** — Classifies the user's message into 4 modes:
   - `quick_qa` — Single-shot queries
   - `monthly_review` — Multi-tool analysis
   - `goal_planning` — Simulation triggers
   - `write` — Data modification commands

2. **Workers (Tools)** — 11 self-contained functions:
   - 7 read tools (get_transactions, get_budget, get_insights, etc.)
   - 4 write tools (add_transaction, create_goal, update_budget, delete_transaction)

3. **LLM Synthesis** — Z.ai chat completions with system prompt enforcing:
   - Cite specific evidence
   - Never fabricate numbers
   - Never give licensed financial advice
   - Respect permission tiers

## Agent Tools

| Tool | Type | Description |
|------|------|-------------|
| `get_transactions` | Read | Query transactions with date/category/merchant filters |
| `get_budget` | Read | Retrieve current month envelope status |
| `get_insights` | Read | Month-over-month deltas, anomaly detection |
| `get_recommendations` | Read | Ranked actionable recommendations |
| `get_goals` | Read | Savings goals with progress percentages |
| `run_simulation` | Read | Monte Carlo simulation (1000 trials) |
| `categorize_merchant` | Write | Re-categorize all transactions for a merchant |
| `add_transaction` | Write | Add a new transaction via natural language |
| `create_goal` | Write | Create a new savings goal |
| `update_budget` | Write | Update a budget envelope |
| `delete_transaction` | Write | Delete a transaction by merchant/amount/date |

### Natural Language Entity Extraction

The agent parses structured data from free text:
- **Amount**: "$50", "50", "$50.00" → cents
- **Merchant**: "at X", "from X", "@X" patterns
- **Category**: 20+ word mappings (groceries→Groceries, coffee→Dining, gas→Transport)
- **Goal name**: "for X", "called X" with article stripping
- **Income detection**: "received", "got paid", "income" → credit direction

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/seed` | POST | Generate synthetic data |
| `/api/chat` | POST | Run the FinWise agent |
| `/api/transactions` | GET/POST | List transactions / CSV upload |
| `/api/budget` | GET/PATCH | Get/update budget |
| `/api/recommendations` | GET/PATCH | List/accept/dismiss recommendations |
| `/api/goals` | GET/PATCH | List/update goals |
| `/api/simulation` | POST | Monte Carlo simulation |
| `/api/upload` | POST | Receipt OCR (simulated) |
| `/api/insights` | GET | Anomalies, MoM, top merchants, subscriptions |
| `/api/analytics` | GET | Health Score, Velocity, Forecast, Heatmap, Monte Carlo, etc. |
| `/api/debt` | GET | Debt payoff planner (Avalanche vs Snowball) |
| `/api/bills` | GET | Bill schedule with coverage analysis |
| `/api/smart-insights` | GET | AI-curated daily insight feed |
| `/api/innovation` | GET | Personality DNA, Future Self, Triggers, Time-Value, Collisions |
| `/api/export` | GET | CSV/JSON export |

## Database Schema

7 Prisma models:

```
User → Transaction ← Category
     → Budget ← Category
     → Goal
     → Conversation → Message
     → Recommendation
```

All monetary values stored as integer cents. Key indexes on `(userId, date)` and `(userId, categoryId)`.

## Security

### Permission Tiers

| Tier | Capabilities |
|------|-------------|
| Viewer | Read-only access to all data |
| Editor | Modify budgets, transactions, goals, recommendations |
| Approver | All Editor permissions + sandbox transfers |

### Privacy Mode

When enabled, the agent's system prompt indicates PII should be scrubbed locally before cloud LLM calls. The flag is passed through the ToolContext to all tools.

### Audit Trail

Every agent interaction is persisted to the Conversation and Message tables. Each assistant message stores the full tool call log as JSON, including tool name, arguments, success status, and summary.

### Regulatory Alignment

- **GDPR**: Right to explanation, right to erasure, data portability
- **CCPA**: "Do Not Sell" toggle
- **PIPL**: Regional data storage, cross-border consent

## Testing

The app has been verified end-to-end with automated browser testing:

- All 8 views load and render correctly
- Agent chat: tested "I spent $42 on groceries at Trader Joe's" → transaction added and persisted
- Agent chat: tested "Create a goal to save $8000 for a vacation" → goal created
- Agent chat: tested "Set my dining budget to $400" → budget updated
- Monte Carlo simulation runs and displays results
- CSV upload imports transactions correctly
- Receipt OCR (simulated) parses and adds transactions
- Permission tiers enforced at API level
- Privacy mode toggle works
- Dashboard auto-refreshes after agent write operations
- Lint passes cleanly with zero errors
- No console errors or hydration warnings

## Deployment

### Development

```bash
bun run dev
```

### Production Build

```bash
bun run build
bun run start
```

### Environment Variables

```env
DATABASE_URL="file:./db/custom.db"
# Z.ai SDK config is auto-loaded from .z-ai-config
```

## Competition Submission

This project is submitted for the PBCSF International Track Topic A: "AI as a Financial Participant."

### Deliverables

1. **Technical Documentation** (mandatory) — `01_FinWise_Technical_Documentation.pdf`
2. **Presentation Deck** (mandatory, 10 min) — `02_FinWise_Presentation_Deck.pptx`
3. **Demo Video** (optional, 5 min) — `03_FinWise_Demo_Video_Script.md`
4. **Source Code** (optional) — This repository + this README
5. **Security Self-Assessment** (optional) — `05_FinWise_Security_Self_Assessment.pdf`
6. **Execution Evidence** (optional) — `06_FinWise_Execution_Evidence.md`

### Scoring Alignment

| Dimension | Weight | How FinWise Addresses It |
|-----------|--------|--------------------------|
| Task Completion | 40% | 20+ working features, 11 agent tools, 14 API endpoints, verified end-to-end |
| Security & Compliance | 30% | 3-tier permissions, privacy mode, audit trail, GDPR/CCPA/PIPL, risk register |
| Innovation & Interaction | 30% | 5 novel features (Personality DNA, Future Self, Triggers, Time-Value, Goal Collisions) |

## License

This project is submitted for the PBCSF International Track competition. IP rights vest with the contestants per competition rules.

## Team

- Team Name: [Your Team Name]
- Members: [Team Member Names]
- Institution: [Your University]
- Track: PBCSF International Track (English)
