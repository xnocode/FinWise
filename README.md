# FinWise — Personal Finance AI Agent

FinWise is an agentic personal finance copilot that helps you track spending, manage budgets, set savings goals, and get financial insights — all through a chat-driven AI agent.

## Key Features

- **Chat-first finance agent** — add transactions, create goals, update budgets, and delete records using natural language
- **Free LLM by default** — runs a local model (TinyLlama via transformers.js) so anyone can use the agent with **no API key and no signup**
- **Optional providers** — configure OpenAI, Anthropic, or a custom endpoint in Settings if you want higher-quality replies
- **Transactions** — view, add, and remove expenses/income with categories and merchants
- **Budgets** — monthly category envelopes with spend tracking
- **Goals** — savings targets with monthly contributions and progress
- **Analysis** — spending-by-category breakdown and monthly income vs spending trends
- **Analytics** — financial health score, spend velocity, cash-flow forecast, Monte Carlo projections
- **Planning** — debt payoff and bill tracking
- **CSV import/export** — bring in bank statements or export your data
- **Multi-view dashboard** — Overview, Transactions, Budgets, Goals, Insights, Analytics, Analysis, Planning, Innovation, Settings

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS + shadcn-ui
- **Database:** Prisma ORM + PostgreSQL
- **Charts:** Recharts
- **Forms:** React Hook Form + Zod
- **AI agent:** Supervisor-worker pattern with tool calling; default LLM is local TinyLlama-1.1B via `@xenova/transformers`
- **Notifications:** Sonner toasts

## Project Structure

```
FinWise/
├── prisma/
│   └── schema.prisma          # Database models (User, Transaction, Category, Budget, Goal, etc.)
├── public/
│   └── logo.svg               # App icon
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/route.ts            # Login / signup / logout
│   │   │   ├── chat/route.ts            # Agent chat endpoint
│   │   │   ├── transactions/route.ts    # List / add transactions (JSON + CSV upload)
│   │   │   ├── transactions/[id]/route.ts # Delete a transaction
│   │   │   ├── analytics/route.ts       # Advanced analytics
│   │   │   ├── budget/route.ts          # Budget CRUD
│   │   │   └── export?format=csv        # CSV export
│   │   ├── page.tsx                     # Main dashboard (all views + chat)
│   │   └── layout.tsx                   # Root layout + metadata
│   ├── components/ui/                   # shadcn-ui primitives
│   └── lib/
│       ├── db.ts                        # Prisma client singleton
│       ├── auth.ts                      # Session auth helpers
│       ├── agent.ts                     # Finance agent (tools + LLM routing)
│       ├── free-llm.ts                  # Free local LLM (no API key)
│       ├── format.ts                    # Currency / date formatting
│       ├── rates.ts                     # Currency conversion
│       └── seed.ts                      # Default categories
├── package.json
├── tailwind.config.ts
├── components.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+ (or Bun)
- PostgreSQL database (local or hosted)

### 1. Install dependencies

```bash
cd "/home/ridoy/Downloads/FinWise"
bun install
# or: npm install
```

### 2. Set up environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/finwise?schema=public"
AUTH_SECRET="your-random-secret-change-this-in-production"
```

- `DATABASE_URL` — your PostgreSQL connection string
- `AUTH_SECRET` — used to sign session cookies (any random string)

### 3. Initialize the database

```bash
bun run db:generate   # Generate Prisma client
bun run db:push       # Push schema to database (creates tables)
bun run db:migrate    # (Alternative: create and run migrations)
```

### 4. Run the development server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start Next.js dev server on port 3000 |
| `bun run build` | Build for production |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |
| `bun run db:generate` | Generate Prisma Client |
| `bun run db:push` | Push Prisma schema to database |
| `bun run db:migrate` | Create and apply Prisma migrations |
| `bun run db:reset` | Reset database (dev only) |

## How the Free Agentic AI Works

FinWise includes a **free local LLM** so your users never need an API key:

1. When a user sends a chat message, the agent runs finance tools server-side (read/write transactions, budgets, goals).
2. The tool results are rewritten into natural language using **TinyLlama-1.1B-Chat** via `@xenova/transformers`.
3. The model downloads once (~600 MB) and is cached on your server. After that, it works fully offline.

**Optional:** Users with an OpenAI, Anthropic, or custom API key can configure it in Settings → AI Agent for higher-quality responses. The free local model remains the default.

## Deploying for Others to Use

If you want other people to use your FinWise instance:

### Option A: Host on your own computer (quickest)
1. Keep the dev server running: `bun run dev`
2. Expose it with a tunnel:
   - `ngrok http 3000`
   - Or: `cloudflared tunnel --url http://localhost:3000`
3. Share the public URL with your friends.

> ⚠️ Your computer must stay on for others to access it.

### Option B: Deploy to a persistent server
Recommended platforms: Railway, Render, Fly.io, or any VPS with Docker/Node support.

- Ensure at least **1–2 GB of free RAM** for the local LLM model.
- Avoid pure serverless platforms (e.g., Vercel serverless) for the local LLM, as cold starts and the 600 MB model download can time out.

## Database Models

- **User** — accounts, auth, tier (Viewer/Editor/Approver)
- **UserSettings** — theme, currency, LLM provider preference, analytics assumptions
- **Category** — spending/income categories with color and icon
- **Transaction** — income/expense records with merchant, date, category, direction
- **Budget** — monthly category spending envelopes
- **Goal** — savings targets with monthly contributions
- **Debt** — loan/credit card balances and APR
- **Recommendation** — AI-generated money-saving suggestions
- **Conversation / Message** — chat history

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

## License

MIT


