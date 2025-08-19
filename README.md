# Certora Scraper

A comprehensive automation toolkit for Certora Prover verification workflows, featuring intelligent analysis, automated repair, and streamlined verification management.

## Overview

Certora Scraper simplifies and automates the Certora Prover verification process by providing:
- **Automated Data Extraction**: Scrape verification results directly from Certora Prover URLs
- **AI-Powered Analysis**: Generate detailed analysis reports using Codex integration  
- **Intelligent Repair System**: Automatically fix CVL and configuration issues with closed-loop error handling
- **Web-Based Interface**: User-friendly GUI for managing verification workflows

## Key Features

### 🔍 **Verification Data Scraping**
- Extract verification results from Certora Prover URLs
- Generate structured Markdown reports with call traces, variables, and state diffs
- Real-time progress tracking with Server-Sent Events (SSE)

### 🤖 **AI-Powered Analysis** 
- Integrated Codex analysis for verification failures
- Streaming analysis results with editable output
- Batch processing for multiple rules

### 🔧 **Automated Repair System**
- Sequential repair workflow for failed verification rules
- Automatic `certoraRun` execution after repairs
- Closed-loop syntax error detection and fixing
- Success URL extraction and display

## Installation & Setup

### Prerequisites
- Node.js 20 (see `.nvmrc`)
- Playwright browsers (installed via script)
- Optional: Codex CLI for AI analysis (`npm i -g @openai/codex`) and `OPENAI_API_KEY` env var

### Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Install Playwright Browsers (first time)**
   ```bash
   npm run playwright:install
   ```

3. **Start the Backend Service**
   ```bash
   npm start
   ```
   Server runs at: http://localhost:3002

4. **Open the Web Interface**
   - Visit http://localhost:3002/  (served directly by the server), or
   - Open `certora_analyzer.html` file in a browser.

5. **(Optional) Enable AI Analysis**
   ```bash
   export OPENAI_API_KEY=sk-...    # Your key
   npm i -g @openai/codex          # If not installed
   ```

## Usage Guide

### Web Interface Workflow

1. **Configure Project Settings**
   - **Solidity Project Path**: Enter the absolute path to your project root directory
   - **Configuration File**: Select a `.conf` file from the auto-populated dropdown (sourced from `<workdir>/certora/conf`)
   - Click "Refresh" if configuration files don't appear

2. **Import Verification Data**
   - **Certora URL**: Paste your Certora Prover results URL (`https://prover.certora.com/output/...`)
   - Click "Get verification data" to extract and process verification results

3. **Analyze Results**
   - **Individual Analysis**: Click "Analyze" for specific failed rules
   - **Batch Analysis**: Use "Codex analyze all rules" for all failed rules
   - **Edit Results**: Analysis outputs can be directly edited in the interface for fine-tuning

4. **Execute Automated Repairs**
   - Click "Execute sequential fix" to start the automated repair process
   - The system will:
     - Process each analysis result sequentially
     - Apply fixes to .spec and .conf
     - Automatically run `certoraRun` with the selected configuration
     - Handle syntax errors with closed-loop repair attempts
     - Display the verification URL upon successful completion

### Interface Features

- **Real-time Progress**: Server-Sent Events (SSE) provide live updates during operations
- **Safe Termination**: Use the "Stop" button to safely abort running processes
- **Markdown Export**: View and copy auto-generated reports including call traces, variables, and state differences
- **Error Handling**: Robust error detection with automatic retry mechanisms

## API Reference

The backend service exposes several REST endpoints for programmatic access:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/analyze-and-fetch` | POST | Extract verification data (synchronous) |
| `/analyze-and-fetch-stream` | POST | Extract verification data with real-time progress (SSE) |
| `/analyze-rule-stream` | POST | Stream Codex analysis for individual rules (SSE) |
| `/generate-fix-prompt` | POST | Generate repair prompts from analysis results |
| `/fix-sequential-stream` | POST | Execute sequential repair workflow (SSE) |
| `/kill-processes` | POST | Terminate all running processes |
| `/list-conf` | GET | List available `.conf` files (`?projectPath=<absolute_path>`) |
| `/health` | GET | Basic health/uptime check |
| `/resume-state` | GET | Current sequential fix resume info |

### Run Without API Key
You can still scrape & generate markdown (the analyze/fix Codex features will simply not work). Don’t click Codex buttons if no key.

## Project Structure

```
certora-scraper/
├── certora_analyzer.html          # Main web interface
├── scripts/
│   ├── certora_auto_server.mjs    # Backend API server
│   ├── certora_scrape.mjs         # Scraping utilities  
│   └── get_failed_rules.mjs       # CLI tool for failed rules
└── package.json                   # Dependencies and scripts
```

### File Descriptions

- **`certora_analyzer.html`**: Interactive web interface for verification management
- **`certora_auto_server.mjs`**: Core backend service handling API requests, Playwright scraping, and process orchestration
- **`certora_scrape.mjs`**: Specialized scraping functions and utilities
- **`get_failed_rules.mjs`**: Command-line utility for extracting non-VERIFIED rules

## Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| **Configuration dropdown empty** | Ensure `<workdir>/certora/conf` exists and contains `.conf` files. Click "Refresh" button. |
| **Analysis fails to start** | Check that the backend service is running and the Certora URL is valid and accessible. |
| **Analysis results take too long to appear** | Try manually stopping the current analysis using the "Stop" button, then restart the analysis process. This can resolve stuck or slow analysis tasks. |
| **Port already in use (3002)** | Stop previous server (`Ctrl+C` in terminal) or kill with `lsof -t -i:3002 | xargs -r kill`. |
| **No browser pops up** | UI is now served at http://localhost:3002/. Open manually if auto open failed. |
| **Codex errors / missing key** | Set `OPENAI_API_KEY` env var and ensure `@openai/codex` CLI installed. |
| **Playwright missing deps** | Re-run: `npm run playwright:install` (installs system dependencies). |

## VS Code Integration

- Tasks (see `.vscode/tasks.json`):
   - "Analyzer: Start Backend" – starts server
   - "Analyzer: Open UI" – attempts to open HTML file (may require a GUI browser)
   - "Analyzer: Full Workflow" – sequential start + open
   - "Analyzer: Start (Headful)" – Playwright debug mode
- Launch configurations (F5) for running the server (headless/headful).

## Scripts Summary

| Script | Purpose |
| ------ | ------- |
| `npm start` | Launch server (serves UI) |
| `npm run start:headful` | Launch with Playwright debug (PWDEBUG=1) |
| `npm run playwright:install` | Install Playwright browsers + system deps |
| `npm run open:ui` | Try to open UI file directly (fallback chain) |
| `npm run health` | Fetch `/health` endpoint (requires running server) |
| `npm run ci` | CI smoke: start server, health check, stop |

## Continuous Integration

GitHub Actions workflow `.github/workflows/ci.yml` performs:
1. Checkout & Node 20 setup
2. `npm install`
3. Playwright browser install
4. Server smoke health check

## License

ISC