# ArchVantage Scenario Simulator - User Guide

## 1. Overview
The **ArchVantage Scenario Simulator** is an AI-powered enterprise architecture planning tool. It bridges the gap between raw architecture documents and executive-level planning by extracting the current topology, allowing you to simulate modernization scenarios, and mathematically evaluating their impact on Time, Budget, and Risk.

---

## 2. Step-by-Step Workflow

### Step 1: Link Documents and Sync
1. Open the **ArchVantage** canvas.
2. Link your source architecture documents (PDFs, Word files, etc.) to the Scenario Simulator node.
3. Click the **"Sync with Documents"** button. The AI agent will parse the documents, extract the **Architecture Topology** (components, dependencies, teams), and visualize them on the canvas.

### Step 2: Select Target Components
1. In the **Scenario Builder** panel (left), find the **Target Components** list.
2. Check the boxes next to the components you intend to modernize or migrate. Unchecked components represent the un-mutated baseline.

### Step 3: Adapt Parameters & Strategy
Navigate through the tabs (`Topology`, `Org`, `Strategy`, `P&L`, `Params`) to configure how the modernization will be executed. You will select migration patterns, assign teams, and set runtime constraints. (See section 3 for details).

### Step 4: Run Simulation or Auto-Solve
Once your parameters are set, you have two choices:
*   **Recalculate Simulation:** Runs the simulation based on *your exact parameters*. The AI calculates the impact, generates a Gantt chart, and updates the dashboards.
*   **Auto-Solve Constraints:** Define your maximum acceptable constraints (Budget, Timeline, Staff) in the *Params* tab, then click this button. The AI will iterate through possible combinations and automatically select the optimal configuration (Pattern, Team, Flags) that fits within your constraints.

### Step 5: Export to PPTX
Once you are satisfied with a simulation, click the **"Export PPTX"** button at the top. The tool will programmatically generate a native, fully editable PowerPoint pitch deck containing the metrics dashboard, Gantt schedule, and a dynamically drawn interactive topology map.

---

## 3. Reference: UI Controls & Dropdowns

### A. Topology Tab
*   **Migration Pattern:** The architectural approach for modernizing the selected components.
    *   *Do Nothing (As-Is):* Baseline.
    *   *Strangler Fig (ACL):* Gradual replacement while keeping the old system alive behind a facade.
    *   *Lift and Shift:* Moving infrastructure without changing code.
    *   *Big Bang Rewrite:* Complete, high-risk overnight replacement.
    *   *(Other patterns include Parallel Run, CDC, Branch by Abstraction).*
*   **Granular Interface Protocols:** Define how specific dependencies between selected components will communicate (e.g., shifting from `Direct Synch RPC` to `Async Event Hub`).

### B. Org Tab
*   **Assignee Team:** Select which team will execute the migration. 
    *   *Platform Squad:* High cloud skill, low domain context.
    *   *Legacy Domain:* High domain context, low cloud skill.
    *   *External Contractor:* High execution speed, steep ramp-up time.
    *   *(Note: The AI automatically extracts organization teams from your documents and populates them here).*
*   **Skill Match Validation:** A dynamically calculated score indicating how well the chosen team matches the complexity of the chosen Migration Pattern.

### C. Strategy Tab
*   **Dual-Run Replication:** Requires running both old and new systems simultaneously. (Increases cost, reduces risk).
*   **Zero-Downtime Cutover:** Requires complex routing to ensure 100% uptime during switch. (Increases time and cost).
*   **Canary Rollout:** Gradual traffic shifting (e.g., 5%, 20%, 100%). (Increases timeline, significantly lowers risk).
*   **Data Backfill Requirement:** Requires historic data synchronization before cutover. (Adds upfront time).

### D. P&L (Profit & Loss) Tab
*   **Estimated Complexity:** (Read-only) Driven by the number of dependencies the target components have.
*   **Blended Hourly Rate:** Standardized cost per engineer.
*   **Hidden Costs:** Calculates infrastructural overlap (e.g., paying for two databases during a Dual-Run).

### E. Params Tab (Constraints)
*   **Max Budget ($):** The absolute ceiling for the project cost.
*   **Max Timeline (Weeks):** The absolute deadline for the project.
*   **Max Concurrent Staff:** The maximum number of engineers available.
*   *Note: These constraints are used exclusively by the **Auto-Solve** agent to find an optimal solution.*

---

## 4. Understanding the Dashboards

*   **Impact Dashboard:** Displays the cumulative calculated impact of all your selected parameters.
    *   *Total Time:* Total weeks required for the project.
    *   *Budget:* Estimated financial cost.
    *   *Risk Index:* A compound score (0.00 to 1.00) measuring execution risk based on patterns and team skills.
    *   *Critical Bottleneck:* The specific phase or component causing the most delay or risk.
*   **Metric Justification:** The AI's plain-English explanation of exactly *why* it assigned the given metrics, referencing your selected strategies.
*   **Gantt Chart (Top Right):** A visual breakdown of the schedule, explicitly flagging the calculated bottleneck component in red.
