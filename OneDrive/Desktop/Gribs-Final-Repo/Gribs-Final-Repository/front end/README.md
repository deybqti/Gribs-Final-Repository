# Hotel Reservation System Frontend

This directory contains both the customer and admin frontend applications for the Hotel Reservation System.

## Quick Start

To run both applications simultaneously:

```bash
npm run dev
```

This will start:
- **Customer App** (Vite + React) - typically on http://localhost:5173
- **Admin App** (Create React App) - typically on http://localhost:3000

**Note:** The commands use `npm --prefix` to run commands in subdirectories, which works cross-platform on Windows, macOS, and Linux.

## Individual Commands

### Run Customer App Only
```bash
npm run dev:customer
```

### Run Admin App Only
```bash
npm run dev:admin
```

## Installation

### Install All Dependencies
```bash
npm run install:all
```

This will install dependencies for:
- Root package (concurrently)
- Customer app
- Admin app

### Manual Installation
```bash
# Root dependencies
npm install

# Customer app dependencies
cd customer
npm install

# Admin app dependencies
cd ../admin
npm install
```

## Build Commands

### Build Both Apps
```bash
npm run build
```

### Build Individual Apps
```bash
npm run build:customer
npm run build:admin
```

## Project Structure

```
front end/
├── package.json          # Root package with scripts to run both apps
├── customer/             # Customer-facing React app (Vite)
│   ├── src/
│   ├── package.json
│   └── ...
├── admin/                # Admin panel React app (Create React App)
│   ├── src/
│   ├── package.json
│   └── ...
└── README.md
```

## Technologies Used

### Customer App
- React 19.1.0
- Vite
- React Router DOM
- Tailwind CSS
- Supabase

### Admin App
- React 19.1.0
- Create React App
- React Router DOM
- Tailwind CSS

## Development

Both applications will run concurrently when you use `npm run dev`. The concurrently package manages running both development servers simultaneously with color-coded output to distinguish between the two applications.
