# World Gaming Platform - Complete Setup & Deployment Guide

## Overview
World Gaming is a fully functional, mobile-first Web Application built with Node.js, Express, and SQLite. It features:
1. **EasyPaisa Manual Payment Integration** (Admin Account: `03453067511`).
2. **Smart Small & Big Prediction Game Engine** (Calculates lowest pool bet side automatically to protect admin capital and guarantee platform profit).
3. **18 Diverse Game Categories Layout**.
4. **Comprehensive Admin Dashboard** (Transaction Approvals, Manual Balance Management, Smart Round Resolution).

---

## 📱 How to Deploy from your iPhone / Mobile (Step-by-Step)

Since you are using an iPhone, follow these exact 3 steps in your browser:

### Step 1: Upload Files to GitHub
1. Open Safari on your iPhone and go to **[https://github.com](https://github.com)**.
2. Sign up or log in.
3. Tap **New Repository**, name it `world-gaming`, and tap **Create**.
4. Tap **Upload files** and select/extract the contents of this ZIP (`server.js`, `package.json`, `public/index.html`, etc.).

### Step 2: Deploy on Render (Free Cloud Hosting)
1. Go to **[https://render.com](https://render.com)** on Safari and sign in with GitHub.
2. Tap **New +** -> **Web Service**.
3. Select your `world-gaming` repository.
4. Set the following fields:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Tap **Create Web Service**.

### Step 3: Get Your Live Link!
- Within 2-3 minutes, Render will provide you a live URL (e.g., `https://world-gaming.onrender.com`).
- Share this link with your players!

---

## 🛡️ Default Admin Credentials
- **Username:** `admin`
- **Phone:** `03453067511`
- When logged in as `admin`, the **Admin Control Panel** will automatically unlock on screen!
