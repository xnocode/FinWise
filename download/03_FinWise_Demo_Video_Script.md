# FinWise Demo Video Script (5 Minutes)

## Video Overview
- **Duration**: 5 minutes
- **Format**: Screen recording with narration
- **Resolution**: 1920x1080 (1080p)
- **Tool**: OBS Studio or Loom

---

## Scene 1: Introduction (0:00 - 0:30)

**Visual**: FinWise app loads in browser. Header shows "FinWise — Personal Finance Intelligence" with gradient logo. The auto-seed runs and the Overview view appears with KPI cards, treemap, and trend chart.

**Narration**:
> "Meet FinWise — an agentic AI personal finance copilot that doesn't just display your data, but actively reasons about it. Built for the PBCSF International Track, FinWise uses a supervisor-worker agent pattern with 11 tools to deliver smart budgeting, spending insights, and predictive forecasting. Let me show you how it works."

---

## Scene 2: Agent Chat — Adding a Transaction (0:30 - 1:15)

**Visual**: Camera focuses on the right-side chat panel. User types: "I spent $42 on groceries at Trader Joe's" and presses Enter. The agent responds with "Added expense: Trader Joe's for $42.00 in category Groceries" and shows the "add_transaction" tool badge with "WRITE" mode. A toast notification appears: "Data updated via agent — Refreshing your dashboard..." The Overview view refreshes and the new transaction appears in the Recent Transactions list.

**Narration**:
> "The agent can add and edit financial data through natural language. When I type 'I spent $42 on groceries at Trader Joe's,' the agent extracts the amount, merchant, and infers the category from the word 'groceries.' It creates the transaction, refreshes the dashboard automatically, and confirms the action. The agent has 4 write tools: add transaction, create goal, update budget, and delete transaction — all permission-aware."

---

## Scene 3: Agent Chat — Monthly Review (1:15 - 2:00)

**Visual**: User types "How did this month go?" The agent switches to "monthly review" mode, calls 3 tools (get_budget, get_insights, get_recommendations), and returns a structured response with bold numbers and bullet points: "Your October spending shows... Shopping is 301% over budget... You have 5 active recommendations totaling $29.7k in potential annual savings."

**Narration**:
> "Ask the agent 'How did this month go?' and it orchestrates three tools in parallel — budget status, spending insights, and recommendations. The response is evidence-driven, citing specific dollar amounts and percentages. The agent never fabricates numbers — every figure comes from real tool data."

---

## Scene 4: Goals + Monte Carlo Simulation (2:00 - 2:45)

**Visual**: Navigate to Goals view. Click "Run Monte Carlo simulation" on the Trip to Japan goal. A loading spinner shows "Running 1000 trials..." then a result card appears with: Median 11 months, 80% CI 11-11 months, Projected date 2027-09-18, Success probability 100%, plus 3 sensitivity scenarios (Cut dining 20%, Cancel 2 subscriptions, Add $100/mo side income) with days saved.

**Narration**:
> "The Goals view includes a Monte Carlo simulation that runs 1000 trials with income volatility modeling. For the Trip to Japan goal, it projects a median completion in 11 months with an 80% confidence window. The sensitivity analysis shows that cutting dining by 20% or canceling two subscriptions would accelerate the timeline by 30 to 90 days."

---

## Scene 5: Advanced Analytics (2:45 - 3:30)

**Visual**: Navigate to Analytics view. Scroll through the Financial Health Score (showing gauge with score and grade badge), Spend Velocity tracker, 14-Day Cash Flow Forecast chart with confidence bands, and the What-If Scenario Builder. Drag the "Extra monthly savings" slider to $500 — the 30-year projected balance updates live from $1,689.8k to $1,720.3k, showing "+$30.5k lifetime gain."

**Narration**:
> "The Analytics view includes a Financial Health Score — a composite metric across 5 weighted factors. The 14-day cash flow forecast uses Holt-Winters triple exponential smoothing. And the What-If Scenario Builder lets you drag sliders to model how changes to your savings, spending, and investment return impact your 30-year financial trajectory — all updating in real time."

---

## Scene 6: Innovation Lab (3:30 - 4:15)

**Visual**: Navigate to Innovation Lab (with "Beta" badge). Show the Financial Personality DNA card — "The Architect" with trait bars (Discipline 95, Frugality 93). Then the Future Self Simulator showing age milestones (30/40/50/65/80) with net worth projections and FIRE reached in 28 years. Then Behavioral Trigger Detection showing detected patterns ("Sunday spending spike", "Post-payday splurge").

**Narration**:
> "The Innovation Lab includes 5 novel features you won't find in any other finance app. Financial Personality DNA classifies you into an archetype based on spending patterns — here, 'The Architect' with high discipline and frugality. The Future Self Simulator projects your net worth at age milestones and calculates when you'll reach financial independence. And Behavioral Trigger Detection mines hidden patterns — like spending 40% more on Sundays or splurging after payday."

---

## Scene 7: Security + Closing (4:15 - 5:00)

**Visual**: Show the header with permission tier selector (Viewer/Editor/Approver) and privacy mode toggle. Switch to Viewer tier — show that the edit buttons disappear from Budget view. Switch to "Local" privacy mode. Then show a final wide shot of the full app with all 3 columns visible.

**Narration**:
> "FinWise enforces a 3-tier permission system — Viewer is read-only, Editor can modify data, Approver can execute transfers. Privacy mode flags PII for local scrubbing before any cloud LLM call. Every agent interaction is logged with a full audit trail. With 20+ features, 11 agent tools, 14 API endpoints, and 5 novel innovation features, FinWise turns personal finance from passive tracking into active intelligence. Thank you."

---

## Recording Tips

1. **Pre-seed the data** before recording so all views are populated
2. **Type slowly** in the chat so viewers can read the input
3. **Pause briefly** after each agent response before moving on
4. **Highlight key numbers** by hovering over them with the mouse
5. **Keep the chat panel open** throughout — it's the hero feature
6. **Test all interactions** before recording to avoid errors on camera
7. **Use a clean browser profile** — no extensions or bookmarks visible
8. **Record at 1080p, 30fps** for smooth playback

## Post-Production

- Add a title card at the start: "FinWise — PBCSF International Track Topic A"
- Add background music (low volume, instrumental)
- Add subtitles for accessibility
- Export as MP4, H.264, 1080p
- Duration target: 4:45 - 5:00 (must not exceed 5:00)
