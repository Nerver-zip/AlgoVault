# ⚡ AlgoVault

<p align="center">
  <img src="extension/assets/logo.png" alt="AlgoVault Logo" width="120" />
</p>

<h3 align="center">Your Competitive Programming Operating System</h3>

<p align="center">
  <b>Performance Telemetry • Contest Intelligence • Glicko-2 Mastery • FSRS-4.5 Spaced Repetition</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-dfa054?style=for-the-badge&logo=googlechrome&logoColor=black" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Spring_Boot-3.3-6DB33F?style=for-the-badge&logo=springboot&logoColor=white" alt="Spring Boot 3.3" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 18" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
</p>

---

AlgoVault is an elite, self-hosted performance telemetry, rating estimation, and algorithmic mastery tracker. It operates via a lightweight, ultra-fast Chrome Extension (Manifest V3) that intercepts problem statistics and submission telemetry in real-time, backed by a Spring Boot engine that models your cognitive skill levels per topic using **Glicko-2 ratings** and **FSRS-4.5 spaced repetition**.

---

## 📸 Visual Showcase & Feature Tour

### 📊 Performance Analytics & Live Focus Dashboard
The main sidepanel dashboard provides daily quests, live-ticking focus session timers, 7-day practice activity charts, and cognitive loading telemetry.

<p align="center">
  <img src="readme-images/DashBoard.png" alt="AlgoVault Main Dashboard Overview" width="49%" />
  <img src="readme-images/DashBoard2.png" alt="Dashboard Quests & Live Focus Timer" width="49%" />
</p>

---

### 🏆 The Trophy Vault & 3D Achievement Showcase
A tactile display case designed with 3D badge parallax tilts (`preserve-3d` and Framer Motion spring physics), tier shelves (**Common**, **Rare**, **Epic**, **Legendary**), custom spotlight beams for legendary achievements (*CR7*, *Number 10 / Messi*, *All Kill*, *Guardian*), and interactive confetti explosions (`canvas-confetti`).

<p align="center">
  <img src="readme-images/Achivements.png" alt="The Trophy Vault & 3D Badges Showcase" width="98%" />
</p>

---

### ⚔️ Contest Intelligence, Timeline & Replay Engine
Monitor official LeetCode rating progression graphs, peak ratings, global ranks, solve breakdown distribution bars ($4/4$, $3/4$, $2/4$, $1/4$, $0/4$), and live countdowns for upcoming contests across LeetCode, Codeforces, and AtCoder.

<p align="center">
  <img src="readme-images/ContestSummary.png" alt="Contest Performance Summary & Rating Bar" width="49%" />
  <img src="readme-images/all_contestData.png" alt="All Contest Rating Trajectory & History" width="49%" />
</p>

<p align="center">
  <img src="readme-images/ContestReplay0.png" alt="Contest Replay Timeline Scrub Bar" width="49%" />
  <img src="readme-images/ReplyOfContest.png" alt="Contest Replay Detailed Analysis" width="49%" />
</p>

<p align="center">
  <img src="readme-images/ALlUpcomingcontest.png" alt="Upcoming Contests Schedule & Platform Countdowns" width="98%" />
</p>

---

### 📊 Rating Band Matrix & Progress Heatmap
Visualizes your solve conversion rate and attempt volume across official contest rating bands with dynamic height Solve vs Attempted comparison charts.

<p align="center">
  <img src="readme-images/RatingBands.png" alt="Rating Band Matrix & Solve Conversion Heatmap" width="98%" />
</p>

---

### 🎯 Glicko-2 Topic Mastery & Weakness Discovery
Models your cognitive skill per tag using Glicko-2 ratings, Rating Deviation ($\text{RD}$), and Volatility ($\sigma$). Automatically detects weak topic areas where your solve probability lags behind your target rating.

<p align="center">
  <img src="readme-images/Mastery2.png" alt="Glicko-2 Topic Mastery Radar & Rating Bands" width="49%" />
  <img src="readme-images/Practice.png" alt="Weakness Discovery & Targeted Recommendations" width="49%" />
</p>

---

### 🧠 Curriculum Board, Pattern Simulators & Lessons
Interactive step-by-step pattern visualizers (Monotonic Stack, Sliding Window, Two Pointers) paired with comprehensive lesson modules directly inside the sidepanel.

<p align="center">
  <img src="readme-images/PatternHome.png" alt="Pattern Curriculum Board Home" width="49%" />
  <img src="readme-images/Patterns.png" alt="Curriculum Pattern Overview" width="49%" />
</p>

<p align="center">
  <img src="readme-images/LearnPattern.png" alt="Interactive Pattern Lesson Module" width="49%" />
  <img src="readme-images/LeranPatern1.png" alt="Pattern Step-by-Step Simulator" width="49%" />
</p>

<p align="center">
  <img src="readme-images/Pattern0.png" alt="Pattern Exhibit Simulator Visualizer" width="98%" />
</p>

---

### 📚 Curated Study Lists (NeetCode 150, Striver SDE & ZeroTrac)
Track problem completion across **NeetCode 150**, **Striver SDE Sheet**, and filter problems dynamically by ZeroTrac difficulty ratings.

<p align="center">
  <img src="readme-images/neetcode150.png" alt="NeetCode 150 Curriculum List" width="32%" />
  <img src="readme-images/StriverSde.png" alt="Striver SDE Sheet List" width="32%" />
  <img src="readme-images/ZeroTracList.png" alt="ZeroTrac Rating Filter & Problem List" width="32%" />
</p>

---

### 🎮 In-Page Submission Celebrations & Settings
AlgoVault triggers GTA (*Mission Passed* / *Wasted*) and Minecraft (*Level Up* / *You Died*) celebration modals on submission verdicts, configurable via the extension settings panel.

<p align="center">
  <img src="extension/assets/gta-accepted-img.png" alt="GTA Mission Passed Celebration" width="49%" />
  <img src="extension/assets/gta-rejected-img.png" alt="GTA Wasted Failure Overlay" width="49%" />
</p>

<p align="center">
  <img src="readme-images/Setting.png" alt="Extension Settings & Synchronization Panel" width="98%" />
</p>

---

## 🏗️ Technical Stack & System Architecture

```mermaid
graph TD
    subgraph "Browser Context (leetcode.com)"
        MAIN[MAIN World: Fetch Interceptor]
        ISOLATED[ISOLATED World: Telemetry Scripts]
        UI[Plasmo React UI: Overlays & Sidepanel]
    end

    subgraph AlgoVault Local Server
        SRV[Spring Boot Web Service]
        Redis[(Redis Cache)]
        DB[(PostgreSQL Database)]
    end

    subgraph External Platforms
        LC[LeetCode REST/GraphQL APIs]
        EH[EntrantHub API Proxy]
        ZT[ZeroTrac Contest Rating API]
    end

    MAIN -->|window.postMessage| ISOLATED
    ISOLATED -->|chrome.runtime| SRV
    UI -->|API Requests| SRV
    SRV <---> DB
    SRV <---> Redis
    SRV -->|History / Ranks| LC
    SRV -->|Predictions| EH
    SRV -->|Rating Maps| ZT
```

### 💻 Chrome Extension (Manifest V3)
- **Framework:** [Plasmo](https://www.plasmo.com/) extension framework with React 18, TypeScript, and TailwindCSS.
- **Tactile 3D Badge Cabinet:** Uses `framer-motion` for physical card translations (`preserve-3d` and `translateZ(24px)`) and responsive mouse-follow specular glare filters.
- **Analytics Charts:** Built using `recharts` custom-engineered with nested SVG callbacks (`NestedBarShape`) to render solved bars inside attempted bars cleanly.

### ☕ Spring Boot Backend Service
- **Core Engine:** Spring Boot 3.3, Java 17+, Hibernate JPA, Maven.
- **Relational Storage:** PostgreSQL database managing users, submissions, tag masteries, contest results, and spaced repetition cards.
- **Migration Engine:** [Flyway Migrations](https://flywaydb.org/) executing sequence updates and indexes (`V1` to `V18`).
- **Caching Layer:** Redis serving key-value caches for user sessions, dashboards, and live rating buckets.

---

## 🧮 Mathematical Modeling & Core Calculations

### 1. Practice Estimate (Smoothed Comparable First Attempts)
The practice estimate starts with a weak rating prior and combines it with the user's **first attempts** on previously attempted problems within $\pm 150$ ZeroTrac rating points. A Beta-binomial prior of strength 8 prevents tiny samples from producing extreme percentages:

$$P = \frac{8P_{\text{rating}} + \text{first-attempt accepts}}{8 + \text{comparable first attempts}}$$

### 2. Topic ELO Rating Update
Upon solving or failing a problem with rating $R_p$, your topic rating $R_u$ updates via:

$$R_u^{\text{new}} = R_u^{\text{old}} + K \times (\text{Score} - P(\text{solve}))$$

*   $\text{Score} = 1.0$ (Accepted) or $0.0$ (Rejected).
*   $K$ is a dynamic scaling factor based on completed problems in the category.

### 3. Spaced Repetition (FSRS-4.5 Engine)
AlgoVault implements the **FSRS-4.5 (Free Spaced Repetition Scheduler)** model, replacing legacy SM-2 algorithms with power-law forgetting curves and dynamic difficulty estimation:

*   **Power-Law Forgetting Curve:** Computes review intervals $I$ via Stability $S$ and desired retention target $R = 0.90$:
    $$I(S, R) = S \times \left(9 \times \left(\frac{1}{R} - 1\right)\right)^{1/\text{DECAY}}$$
*   **Difficulty & Mean Reversion:** Card difficulty $D$ adjusts after each review based on recall grade (1 = *Again*, 2 = *Hard*, 3 = *Good*, 4 = *Easy*).
*   **Topic Weakness Multiplier:** Applies a $0.6\times$ acceleration factor to problems in topics where user mastery lags behind rating.

---

## 🛠️ Step-by-Step Installation & Setup Guide

### 🐳 Method A: Containerized Infrastructure (Docker Compose)
If you have Docker Desktop installed:

1. **Start Services:** Launch PostgreSQL and Redis containers:
   ```bash
   docker-compose up -d postgres redis
   ```
2. **Verify Containers:**
   ```bash
   docker ps
   ```
   *PostgreSQL runs on port `5432` and Redis on port `6379`.*

---

### 💻 Method B: Native Setup Without Docker

#### 🍏 macOS Setup
```bash
# 1. Install Postgres and Redis via Homebrew
brew install postgresql@15 redis

# 2. Start Services
brew services start postgresql@15
brew services start redis

# 3. Create Target Database
createdb algovault
```

#### 🪟 Windows Setup
1. **Install PostgreSQL:** Download installer from [PostgreSQL Official Website](https://www.postgresql.org/download/windows/). Set password (`algovault_dev`).
2. **Install Redis via WSL2:**
   ```powershell
   wsl --install
   ```
   Inside WSL Ubuntu:
   ```bash
   sudo apt update && sudo apt install redis-server -y
   sudo service redis-server start
   ```
3. **Initialize Database:** In **pgAdmin** or **psql**:
   ```sql
   CREATE DATABASE algovault;
   ```

#### 🐧 Linux Setup (Ubuntu/Debian)
```bash
sudo apt update && sudo apt install postgresql postgresql-contrib redis-server -y
sudo systemctl start postgresql && sudo systemctl enable postgresql
sudo systemctl start redis-server && sudo systemctl enable redis-server
sudo -u postgres createdb algovault
```

---

### 🚀 Running the Services & Extension

#### 1. Boot up the Spring Boot Backend
```bash
cd backend
# Optional: Set custom DB password if different from default
export SPRING_DATASOURCE_PASSWORD=your_password
./mvnw spring-boot:run
```
*Flyway Migrations will automatically build schema tables (`V1` to `V18`). Server runs at `http://localhost:8080`.*

#### 2. Compile and Load the Chrome Extension
```bash
cd extension
npm install
npm run build
```
Load into Google Chrome:
1. Open `chrome://extensions/`
2. Enable **Developer Mode** (top-right toggle).
3. Click **Load Unpacked** and select `extension/build/chrome-mv3-prod/`.

---

<p align="center">
  <b>Built for competitive coders striving for Knight, Guardian, & Grandmaster ranks. ⚔️</b>
</p>
