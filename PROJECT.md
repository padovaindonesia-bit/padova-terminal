# PADOVA Terminal

## Overview

PADOVA Terminal is an internal web application for PADOVA, a small Indonesian bedding manufacturer established in 1985.

The application is designed for a single Android tablet placed in the factory. It is used by factory staff for attendance, inventory movement, production recording, and packing.

The application prioritizes:

- Simplicity
- Reliability
- Speed
- Minimal training
- Fool-proof workflow

This is **NOT** a customer-facing application.

---

# Project Goal

Build a lightweight internal factory terminal that allows staff to complete routine tasks with as few taps as possible.

Staff should never need to understand computers.

If they know where to tap, the application has done its job.

---

# Current Technology

Frontend

- HTML
- CSS
- Vanilla JavaScript
- GitHub Pages

Backend

- Google Apps Script
- Google Sheets

Database

Google Sheets

---

# Current Project Structure

/
├── index.html
├── style.css
├── script.js
├── Logo Primary.png
└── PROJECT.md

---

# Current Status

Completed

✅ GitHub Pages deployment

✅ Home Screen

✅ PADOVA branding

✅ Home → Attendance navigation

✅ Attendance → Home navigation

In Progress

🔄 Attendance module

Not Started

- Camera
- QR Scanner
- Attendance logic
- Selfie capture
- Google Sheets integration
- Stock
- Production
- Packing
- Admin

---

# Planned Modules

1. Attendance

Functions:

- Check In
- Check Out
- QR Scan
- Selfie
- Attendance Log

---

2. Stock

Functions:

- QR Scan Item
- Stock In
- Stock Out
- Current Stock Update

---

3. Production

Functions:

- Record production quantity
- Production history

---

4. Packing

Functions:

- Scan invoice
- Record packing completion
- Packing history

---

# UI Principles

The UI is designed for factory workers.

Requirements:

- Large buttons
- High contrast
- Minimal text
- Minimal typing
- Mobile-first
- Tablet optimized

Avoid:

- Complex menus
- Tiny buttons
- Long forms

---

# Language Rules

Application language:

Bahasa Indonesia

Always use:

"kamu"

Never use:

"Anda"

The wording should feel friendly, simple, and natural.

---

# Design Style

Brand:

PADOVA

Style:

Clean

Minimal

Modern

Professional

Colors:

Use PADOVA brand colors.

Avoid unnecessary decorations.

---

# Coding Principles

Never rewrite the project without request.

Only modify the files required for the requested feature.

Preserve existing functionality.

Keep code simple.

Keep functions small.

Avoid unnecessary libraries.

Do not introduce frameworks.

Use plain HTML, CSS, and JavaScript unless explicitly approved.

---

# Development Rules

One feature per sprint.

One feature must work before starting the next.

Never implement future roadmap items early.

Always test after every feature.

---

# Attendance Workflow (Target)

Staff taps:

Absensi

↓

Camera opens

↓

Staff scans QR ID

↓

Staff information is retrieved

↓

Confirmation screen

↓

Automatic selfie

↓

Attendance saved to Google Sheets

↓

Success screen

↓

Return to Home

---

# Stock Workflow (Target)

Staff taps:

Stock

↓

Scan Item QR

↓

Choose:

Masuk

or

Keluar

↓

Enter quantity

↓

Save

↓

Google Sheets updated

---

# Production Workflow (Target)

Produksi

↓

Choose product

↓

Input quantity

↓

Save

↓

Production Log updated

---

# Packing Workflow (Target)

Packing

↓

Scan Invoice QR

↓

Confirm items

↓

Complete packing

↓

Packing Log updated

---

# Current Constraints

The application will initially run on:

- One Android tablet

QR scanning uses the tablet camera.

No dedicated barcode scanner.

No external hardware.

Google Sheets remains the database.

---

# Future Improvements

- Admin Dashboard
- Offline support
- Push notifications
- Customer lookup
- Production statistics
- Inventory dashboard
- Photo history
- Export reports

These are NOT part of the current development.

---

# Important Rules for AI Assistants

Assume the user is NOT a programmer.

Explain every step clearly.

Never ask the user to modify multiple files unless necessary.

When providing code:

- Specify which file to edit.
- Prefer modifying one file at a time.
- Do not redesign working features.
- Preserve existing functionality.
- Keep changes minimal.

Always build incrementally.

This is a production application, not a coding exercise.
