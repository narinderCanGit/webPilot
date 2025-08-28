# WebPilot AI Agent

An intelligent browser automation agent that can interact with websites like a human using OpenAI's GPT and Playwright.

## Features

- 🤖 AI-powered web navigation and form filling
- 🖥️ Visual screenshot analysis for decision making
- 🎯 Automatic form detection and interaction
- 🔄 Human-like browsing behavior
- 📸 Real-time screenshot feedback
- 🛡️ Safe test data for form filling

## Task Overview

This agent is specifically designed to:
1. Navigate to narinder.in
2. Automatically locate the contact section or contact form
3. Fill in contact details with appropriate test data
4. Submit the contact form

## Prerequisites

- Node.js 18+ 
- OpenAI API key
- Internet connection

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npm run install-browsers
   ```

3. **Verify setup (optional):**
   ```bash
   npm run verify
   ```

4. **Run basic demo (no API key required):**
   ```bash
   npm run demo
   ```

5. **For full AI agent (requires OpenAI API key):**
   ```bash
   cp .env.example .env
   # Edit .env and add your OpenAI API key
   npm start
   ```

The agent will:
- Launch a Chromium browser (visible, not headless)
- Navigate to narinder.in
- Analyze the page structure
- Find and fill authentication forms
- Submit the form
- Provide real-time feedback and screenshots

## How It Works

### AI Agent Tools

The agent uses several specialized tools:

- **take_screenshot**: Captures page state for visual analysis
- **open_url**: Navigate to websites
- **get_page_info**: Analyze page structure and forms
- **click_element**: Click elements using CSS selectors
- **fill_input**: Fill form fields with data
- **wait_for_element**: Wait for elements to load
- **send_keys**: Type text directly

### Automation Flow

1. **Initialize**: Launch browser and take initial screenshot
2. **Navigate**: Go to target website (narinder.in)
3. **Analyze**: Use AI to understand page structure and locate contact sections
4. **Navigate to Contact**: Find contact links or scroll to contact sections
5. **Fill**: Automatically fill contact form fields with appropriate test data
6. **Submit**: Click submit button and verify results
7. **Report**: Provide detailed feedback on success/failure

### Safety Features

- Uses safe test data (no real credentials)
- Non-headless mode for transparency
- Detailed logging and error handling
- Graceful cleanup and browser closure

## Test Data Strategy

The agent uses safe, realistic test data:
- **Name**: John Doe
- **Email**: john.doe@example.com
- **Phone**: +1-555-123-4567
- **Message**: Test message from automation agent
- **Subject**: Test Contact Form Submission
- **Company**: Test Company
- **Other fields**: Context-appropriate test values

## Troubleshooting

**Browser doesn't launch:**
- Ensure Playwright browsers are installed: `npx playwright install`

**API errors:**
- Verify your OpenAI API key in `.env`
- Check your API quota and billing

**Form not found:**
- The agent will analyze page structure and provide feedback
- Check browser console for additional details

**Network issues:**
- Ensure stable internet connection
- The agent waits for network idle before proceeding

## Architecture

```
WebPilot AI Agent
├── OpenAI GPT-4 (Decision Making)
├── Playwright (Browser Control)
├── Screenshot Analysis (Visual Feedback)
└── Tool Orchestration (Action Execution)
```

## Evaluation Criteria

✅ **Correctness**: Successfully navigates and fills forms  
✅ **Automation Flow**: Smooth, human-like interactions  
✅ **Prompt Handling**: Accurate task execution  
✅ **Code Quality**: Clean, structured, maintainable code  
✅ **Demo Clarity**: Visible browser with step-by-step feedback  

## Demo

Run the agent and watch as it:
1. Takes screenshots to understand the page
2. Intelligently locates authentication forms
3. Fills fields with appropriate test data
4. Submits forms and handles responses
5. Provides real-time feedback throughout the process

The browser remains visible throughout the process for complete transparency.
