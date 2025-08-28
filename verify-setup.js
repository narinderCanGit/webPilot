#!/usr/bin/env node

import "dotenv/config";

// Basic setup verification
console.log("🔍 Verifying WebPilot AI Agent setup...\n");

// Check Node.js version
const nodeVersion = process.version;
console.log(`📦 Node.js version: ${nodeVersion}`);

if (parseInt(nodeVersion.slice(1)) < 18) {
  console.error("❌ Node.js 18+ required");
  process.exit(1);
}

// Check environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY not found in environment");
  console.log("💡 Please create a .env file with your OpenAI API key");
  process.exit(1);
} else {
  console.log("✅ OpenAI API key found");
}

// Check dependencies
try {
  await import("@openai/agents");
  console.log("✅ @openai/agents package found");
} catch (error) {
  console.error("❌ @openai/agents package not found");
  console.log("💡 Run: npm install @openai/agents");
  process.exit(1);
}

try {
  await import("playwright");
  console.log("✅ Playwright package found");
} catch (error) {
  console.error("❌ Playwright package not found");
  console.log("💡 Run: npm install playwright");
  process.exit(1);
}

try {
  await import("zod");
  console.log("✅ Zod package found");
} catch (error) {
  console.error("❌ Zod package not found");
  console.log("💡 Run: npm install zod");
  process.exit(1);
}

console.log("\n🎉 Setup verification complete!");
console.log("🚀 Ready to run: npm start");
