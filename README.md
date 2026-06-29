# Raw Material Price Impact Dashboard

A real-time raw material price impact calculator and dashboard built with **React (Vite)**, **Supabase**, and **Drizzle ORM**. It calculates and tracks price variations for industrial components based on changing alloy indexes and scrap recovery rates.

---

## 🏗️ Architecture Overview

The codebase is organized as a monorepo using **pnpm workspaces**:

```mermaid
graph TD
    UI[Vite React Frontend] -->|Direct Real-time Sync| DB[(Supabase PostgreSQL)]
    CLI[Drizzle-Kit CLI] -->|Database Migrations| DB
    Server[Express API Server] -->|Direct Pool Connection| DB
```

* **Frontend (`artifacts/rm-price`)**: A modern Vite + React application styled with Tailwind CSS, utilizing `@supabase/supabase-js` for real-time Postgres subscriptions and direct client-side querying.
* **Database Layer (`lib/db`)**: Configures PostgreSQL schema definitions and migrations using Drizzle ORM.
* **Backend API Server (`artifacts/api-server`)**: A lightweight Express server for API integrations, diagnostics, and health monitoring.

---

## 🧮 Calculation Formulas

The dashboard dynamically computes price variations using standard industrial accounting formulas:

1. **Melting Loss Weight**:
   $$\text{Melting Loss Weight} = \text{Cast Weight} \times 1.06$$
2. **Raw Material (RM) Impact**:
   $$\text{RM Impact} = (\text{New Alloy Rate} - \text{Old Alloy Rate}) \times \text{Melting Loss Weight}$$
3. **Scrap Recovery Deduction** *(only applies to machined parts)*:
   $$\text{Scrap Weight} = \text{Cast Weight} - \text{Machining Weight}$$
   $$\text{Scrap Deduction} = (\text{New Scrap Rate} - \text{Old Scrap Rate}) \times \text{Scrap Weight} \times 0.8$$
4. **New Price**:
   $$\text{New Price} = \text{Base Price} + \text{RM Impact} - \text{Scrap Deduction}$$

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have Node.js (v20+) and `pnpm` installed on your machine.

### 2. Installation
Install the project dependencies from the root directory:
```bash
pnpm install
```

### 3. Environment Variables
Create a `.env` file at the root of the workspace:
```env
DATABASE_URL=postgresql://postgres:[YOUR_PASSWORD]@db.nywlqqjvyzagprrifkcf.supabase.co:5432/postgres
PORT=5000
```
*Replace `[YOUR_PASSWORD]` with your actual Supabase database password.*

---

## 🗄️ Database Schema & Provisioning

To update or provision the tables (`parts`, `rm_index`, `settings`) on your Supabase instance:

1. **Generate migrations** based on the schema definitions:
   ```bash
   pnpm --filter @workspace/db run push
   ```
2. **Apply the migrations** safely (non-interactively):
   ```bash
   npx drizzle-kit migrate --config ./lib/db/drizzle.config.ts
   ```

---

## 💻 Running Locally

Start the backend and frontend dev servers concurrently:

* **Start the Express API Server (Backend)**:
  ```bash
  pnpm --filter @workspace/api-server run dev
  ```
  *Listens on [http://localhost:5000](http://localhost:5000)*

* **Start the Vite Frontend Dashboard (UI)**:
  ```bash
  pnpm --filter @workspace/rm-price run dev
  ```
  *Listens on [http://localhost:5173](http://localhost:5173)*

---

## ☁️ Vercel Deployment

The application frontend is configured to deploy directly to Vercel.

### Deployment Commands
1. **Link to Vercel**:
   ```bash
   npx vercel link --yes
   ```
2. **Set environment variables on Vercel**:
   ```bash
   npx vercel env add VITE_SUPABASE_URL production
   npx vercel env add VITE_SUPABASE_ANON_KEY production
   ```
3. **Deploy to production**:
   ```bash
   npx vercel --prod --yes
   ```

The live application is accessible at:  
👉 **[https://price-impact-dashboard-main.vercel.app](https://price-impact-dashboard-main.vercel.app)**
