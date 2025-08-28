import "dotenv/config";
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import { chromium } from "playwright";

// Validate environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error(
    "❌ Error: OPENAI_API_KEY is required. Please set it in your .env file."
  );
  process.exit(1);
}

console.log("🌐 Launching browser...");
const browser = await chromium.launch({
  headless: false, // Keep visible for demo purposes
  chromiumSandbox: true,
  slowMo: 500, // Add slight delay for better visibility
  env: {},
  args: [
    "--disable-extensions",
    "--disable-file-system",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--ignore-certificate-errors",
    "--ignore-ssl-errors",
    "--ignore-certificate-errors-spki-list",
  ],
});

const page = await browser.newPage();

// Set a reasonable viewport size
await page.setViewportSize({ width: 1280, height: 720 });

// Add some user agent for more realistic browsing
await page.setExtraHTTPHeaders({
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
});

console.log("✅ Browser launched successfully!");

const takeScreenShot = tool({
  name: "take_screenshot",
  description:
    "Takes a screenshot of the current page and returns it as base64",
  parameters: z.object({}),
  async execute() {
    const screenshot = await page.screenshot({
      encoding: "base64",
      fullPage: false, // Only visible viewport, not full page
      quality: 60, // Reduce quality to decrease size
    });
    return `data:image/png;base64,${screenshot}`;
  },
});

const openURL = tool({
  name: "open_url",
  description: "Navigate to a specific URL",
  parameters: z.object({
    url: z.string().describe("The URL to navigate to"),
  }),
  async execute(input) {
    try {
      console.log(`🔗 Navigating to: ${input.url}`);

      // Try with different loading strategies
      try {
        await page.goto(input.url, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
      } catch (httpsError) {
        console.log(`⚠️  HTTPS failed, trying HTTP fallback...`);
        const httpUrl = input.url.replace("https://", "http://");
        await page.goto(httpUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
      }

      console.log(`✅ Successfully loaded: ${input.url}`);
      return `Successfully navigated to ${input.url}`;
    } catch (error) {
      console.error(`❌ Failed to navigate to ${input.url}:`, error.message);
      return `Failed to navigate to ${input.url}: ${error.message}`;
    }
  },
});

const clickOnScreen = tool({
  name: "click_screen",
  description: "Clicks on the screen with specified coordinates",
  parameters: z.object({
    x: z.number().describe("x axis on the screen where we need to click"),
    y: z.number().describe("Y axis on the screen where we need to click"),
  }),
  async execute(input) {
    await page.mouse.click(input.x, input.y);
    // Wait a bit for any animations or page updates
    await page.waitForTimeout(1000);
    return `Clicked at coordinates (${input.x}, ${input.y})`;
  },
});

const sendKeys = tool({
  name: "send_keys",
  description: "Type text into the currently focused element",
  parameters: z.object({
    text: z.string().describe("The text to type"),
  }),
  async execute(input) {
    await page.keyboard.type(input.text);
    return `Typed: ${input.text}`;
  },
});

const clickElement = tool({
  name: "click_element",
  description: "Click on an element using CSS selector",
  parameters: z.object({
    selector: z.string().describe("CSS selector of the element to click"),
  }),
  async execute(input) {
    try {
      await page.click(input.selector);
      await page.waitForTimeout(1000);
      return `Clicked element with selector: ${input.selector}`;
    } catch (error) {
      return `Failed to click element: ${error.message}`;
    }
  },
});

const fillInput = tool({
  name: "fill_input",
  description: "Fill an input field with text using CSS selector",
  parameters: z.object({
    selector: z.string().describe("CSS selector of the input field"),
    text: z.string().describe("Text to fill in the input field"),
  }),
  async execute(input) {
    try {
      console.log(`⌨️  Filling input ${input.selector} with: ${input.text}`);

      // Wait for element to be present and visible
      await page.waitForSelector(input.selector, {
        state: "visible",
        timeout: 5000,
      });

      // Verify the field type before filling
      const fieldInfo = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        return {
          type: element?.type || element?.tagName.toLowerCase(),
          name: element?.name,
          placeholder: element?.placeholder,
          id: element?.id,
          currentValue: element?.value || "",
        };
      }, input.selector);

      console.log(`📋 Field info for ${input.selector}:`, fieldInfo);

      // Clear the field completely first
      await page.click(input.selector); // Focus the field
      await page.keyboard.down("Control"); // or 'Meta' on Mac
      await page.keyboard.press("a"); // Select all
      await page.keyboard.up("Control");
      await page.keyboard.press("Delete"); // Delete selected content

      // Wait a moment for the field to clear
      await page.waitForTimeout(500);

      // Now type the new value
      await page.type(input.selector, input.text);

      // Verify the value was set correctly
      await page.waitForTimeout(500); // Wait for the value to be set
      const actualValue = await page.inputValue(input.selector);
      console.log(
        `✅ Successfully filled input: ${input.selector} with value: "${actualValue}"`
      );

      // Check if the value matches what we intended
      if (actualValue !== input.text) {
        console.log(
          `⚠️  Warning: Expected "${input.text}" but got "${actualValue}"`
        );
        // Try one more time with a different approach
        await page.fill(input.selector, input.text);
        const retryValue = await page.inputValue(input.selector);
        console.log(`🔄 Retry result: "${retryValue}"`);
      }

      return `Successfully filled input ${input.selector} with: ${input.text} (verified: ${actualValue})`;
    } catch (error) {
      console.error(
        `❌ Failed to fill input ${input.selector}:`,
        error.message
      );
      return `Failed to fill input ${input.selector}: ${error.message}`;
    }
  },
});

const waitForElement = tool({
  name: "wait_for_element",
  description: "Wait for an element to appear on the page",
  parameters: z.object({
    selector: z.string().describe("CSS selector of the element to wait for"),
    timeout: z
      .number()
      .nullable()
      .optional()
      .describe("Timeout in milliseconds (default: 5000)"),
  }),
  async execute(input) {
    try {
      await page.waitForSelector(input.selector, {
        timeout: input.timeout || 5000,
      });
      return `Element ${input.selector} is now visible`;
    } catch (error) {
      return `Element ${input.selector} did not appear: ${error.message}`;
    }
  },
});

const getPageInfo = tool({
  name: "get_page_info",
  description:
    "Get information about the current page including title, URL, navigation links, and contact forms",
  parameters: z.object({}),
  async execute() {
    const title = await page.title();
    const url = page.url();

    // Get comprehensive page information
    const pageData = await page.evaluate(() => {
      // Get forms
      const forms = Array.from(document.querySelectorAll("form"));
      const formInfo = forms.map((form, index) => {
        const inputs = Array.from(
          form.querySelectorAll("input, select, textarea")
        );
        return {
          formIndex: index,
          formId: form.id || null,
          formClass: form.className || null,
          action: form.action || null,
          inputs: inputs.map((input) => ({
            type: input.type || input.tagName.toLowerCase(),
            name: input.name || null,
            id: input.id || null,
            placeholder: input.placeholder || null,
            required: input.required || false,
            label: input.labels?.[0]?.textContent || null,
          })),
        };
      });

      // Get navigation links (especially contact-related)
      const navLinks = Array.from(
        document.querySelectorAll("a, nav a, .nav a, .menu a")
      )
        .map((link) => ({
          text: link.textContent?.trim() || "",
          href: link.href || "",
          isContactRelated:
            /contact|get.?in.?touch|reach.?out|email|phone/i.test(
              link.textContent || ""
            ),
        }))
        .filter((link) => link.text && link.href);

      // Look for contact sections
      const contactSections = Array.from(
        document.querySelectorAll(
          '[id*="contact"], [class*="contact"], section:has(h1:contains("Contact")), section:has(h2:contains("Contact")), section:has(h3:contains("Contact"))'
        )
      ).map((section) => ({
        id: section.id || null,
        className: section.className || null,
        tagName: section.tagName,
        text: section.textContent?.substring(0, 200) + "..." || "",
      }));

      return {
        forms: formInfo,
        navLinks: navLinks,
        contactSections: contactSections,
        hasContactForm: formInfo.some((form) =>
          form.inputs.some((input) =>
            /name|email|message|subject|phone/i.test(
              input.name || input.placeholder || ""
            )
          )
        ),
      };
    });

    return {
      title,
      url,
      ...pageData,
    };
  },
});

const scrollToElement = tool({
  name: "scroll_to_element",
  description: "Scroll to a specific element on the page",
  parameters: z.object({
    selector: z.string().describe("CSS selector of the element to scroll to"),
  }),
  async execute(input) {
    try {
      await page.locator(input.selector).scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000); // Wait for scroll animation
      return `Scrolled to element: ${input.selector}`;
    } catch (error) {
      return `Failed to scroll to element: ${error.message}`;
    }
  },
});

const findContactSection = tool({
  name: "find_contact_section",
  description: "Look for contact sections, forms, or links on the current page",
  parameters: z.object({}),
  async execute() {
    const contactInfo = await page.evaluate(() => {
      // Look for contact-related text and elements
      const contactKeywords =
        /contact|get.?in.?touch|reach.?out|email.?us|call.?us|message/i;

      // Find contact links
      const contactLinks = Array.from(document.querySelectorAll("a"))
        .filter(
          (link) =>
            contactKeywords.test(link.textContent || "") ||
            contactKeywords.test(link.title || "") ||
            link.href.includes("contact")
        )
        .map((link) => ({
          text: link.textContent?.trim() || "",
          href: link.href,
          selector: link.id
            ? `#${link.id}`
            : link.className
            ? `.${link.className.split(" ")[0]}`
            : null,
        }));

      // Find contact forms (forms with typical contact fields)
      const contactForms = Array.from(document.querySelectorAll("form"))
        .filter((form) => {
          const inputs = Array.from(form.querySelectorAll("input, textarea"));
          return inputs.some((input) =>
            /name|email|message|subject|phone/i.test(
              input.name || input.placeholder || input.id || ""
            )
          );
        })
        .map((form, index) => ({
          formIndex: index,
          id: form.id,
          className: form.className,
          selector: form.id
            ? `#${form.id}`
            : `.${form.className.split(" ")[0]}` ||
              `form:nth-of-type(${index + 1})`,
        }));

      // Find sections with contact in id or class
      const contactSections = Array.from(
        document.querySelectorAll(
          '[id*="contact"], [class*="contact"], section'
        )
      )
        .filter(
          (section) =>
            contactKeywords.test(section.textContent || "") ||
            /contact/i.test(section.id || "") ||
            /contact/i.test(section.className || "")
        )
        .map((section) => ({
          tagName: section.tagName,
          id: section.id,
          className: section.className,
          selector: section.id
            ? `#${section.id}`
            : section.className
            ? `.${section.className.split(" ")[0]}`
            : null,
          hasForm: section.querySelector("form") !== null,
        }));

      return {
        contactLinks,
        contactForms,
        contactSections,
        foundContactElements:
          contactLinks.length > 0 ||
          contactForms.length > 0 ||
          contactSections.length > 0,
      };
    });

    return contactInfo;
  },
});

const submitForm = tool({
  name: "submit_form",
  description:
    "Submit a form by clicking the submit button or using form.submit()",
  parameters: z.object({
    formSelector: z.string().describe("CSS selector of the form to submit"),
  }),
  async execute(input) {
    try {
      console.log(`📤 Attempting to submit form: ${input.formSelector}`);

      // First try to find and click the submit button
      try {
        await page.click(`${input.formSelector} button[type="submit"]`);
        console.log(`✅ Clicked submit button`);
      } catch (buttonError) {
        // Try other submit button selectors
        try {
          await page.click(`${input.formSelector} input[type="submit"]`);
          console.log(`✅ Clicked submit input`);
        } catch (inputError) {
          // Try buttons with submit-like text
          try {
            await page.click(`${input.formSelector} button:has-text("submit")`);
            console.log(`✅ Clicked submit text button`);
          } catch (textError) {
            // Fallback: submit the form programmatically
            await page.evaluate((selector) => {
              const form = document.querySelector(selector);
              if (form) {
                form.submit();
              }
            }, input.formSelector);
            console.log(`✅ Submitted form programmatically`);
          }
        }
      }

      // Wait for potential page changes
      await page.waitForTimeout(2000);

      return `Successfully submitted form: ${input.formSelector}`;
    } catch (error) {
      console.error(`❌ Failed to submit form:`, error.message);
      return `Failed to submit form: ${error.message}`;
    }
  },
});

const checkFieldValues = tool({
  name: "check_field_values",
  description:
    "Check the current values of form fields to verify they're filled correctly",
  parameters: z.object({
    formSelector: z.string().describe("CSS selector of the form to check"),
  }),
  async execute(input) {
    try {
      console.log(`🔍 Checking field values in form: ${input.formSelector}`);

      const fieldValues = await page.evaluate((formSelector) => {
        const form = document.querySelector(formSelector);
        if (!form) return { error: "Form not found" };

        const fields = {
          name: form.querySelector('input[name="name"]')?.value || "",
          email: form.querySelector('input[name="email"]')?.value || "",
          phone: form.querySelector('input[name="phone"]')?.value || "",
          message: form.querySelector('textarea[name="message"]')?.value || "",
        };

        return fields;
      }, input.formSelector);

      console.log(`📊 Current field values:`, fieldValues);
      return `Field values: ${JSON.stringify(fieldValues, null, 2)}`;
    } catch (error) {
      console.error(`❌ Failed to check field values:`, error.message);
      return `Failed to check field values: ${error.message}`;
    }
  },
});

const websiteAutomationAgent = new Agent({
  name: "Website Automation Agent",
  instructions: `
You are a sophisticated web automation agent that can interact with websites like a human user.

Your current task is to:
1. Navigate to narinder.in
2. Locate the contact section automatically
3. Fill in the contact form with appropriate details
4. Submit the form

Rules and Guidelines:
- Always take a screenshot first to see the current state of the page
- After each action, take another screenshot to verify the result
- Use find_contact_section to locate contact forms and sections
- Use get_page_info to understand the page structure
- Look for contact sections, contact forms, or "Contact Us" navigation links
- Navigate to contact sections if they're on separate pages
- Use realistic but safe test data for contact form fields
- Be patient and wait for elements to load before interacting
- If you encounter errors, analyze the page structure and try alternative approaches
- Provide clear feedback about each step you're taking

Contact Form Filling Strategy:
- For name fields: use "John Doe" or "Test User"
- For email fields: use "john.doe@example.com" or similar safe test email
- For phone fields: use "+1-555-123-4567" or similar test phone number
- For message/subject fields: use relevant test messages like "Hello, this is a test message from the automation agent"
- For company fields: use "Test Company" or similar
- For other fields: use appropriate test data based on field type and context

Navigation Strategy:
- First, look for contact sections on the current page
- If no contact form is found, look for "Contact" or "Contact Us" navigation links
- Click on contact links to navigate to contact pages
- Use CSS selectors when possible for reliable element targeting
- Fall back to coordinate clicking only if selectors fail
- Always verify form submission by checking for success messages or page changes
- Scroll to contact sections if they're further down the page
  `,
  tools: [
    takeScreenShot,
    openURL,
    clickOnScreen,
    sendKeys,
    clickElement,
    fillInput,
    waitForElement,
    getPageInfo,
    scrollToElement,
    findContactSection,
    submitForm,
    checkFieldValues,
  ],
});

// Main execution function
async function runWebAutomation() {
  try {
    console.log("🚀 Starting Web Automation Agent...");

    const result = await run(
      websiteAutomationAgent,
      `
Complete this task step by step:

1. Navigate to narinder.in
2. Take a screenshot to see the page
3. Find the contact form 
4. Fill each field ONE BY ONE with verification:
   
   STEP 1: Fill name field
   - Use selector: input[name="name"]
   - Fill with: John Doe
   - Verify it's filled correctly
   
   STEP 2: Fill email field  
   - Use selector: input[name="email"]
   - Fill with: john.doe@example.com
   - Verify it's filled correctly
   
   STEP 3: Fill phone field
   - Use selector: input[name="phone"] 
   - Fill with: +1-555-123-4567
   - Verify it's filled correctly
   
   STEP 4: Fill message field
   - Use selector: textarea[name="message"]
   - Fill with: Hello, this is a test message from the automation agent.
   - Verify it's filled correctly

5. Submit the form using submit_form tool

CRITICAL: 
- Fill fields ONE AT A TIME
- Verify each field after filling before moving to next
- Take screenshot after filling all fields to verify
- Do NOT fill multiple fields simultaneously
    `,
      {
        maxTurns: 20,
      }
    );

    console.log("✅ Automation completed successfully!");
    console.log("Result:", result);
  } catch (error) {
    console.error("❌ Automation failed:", error);
  } finally {
    // Keep browser open for a few seconds to see the final result
    console.log("🔄 Keeping browser open for 10 seconds to review results...");
    await new Promise((resolve) => setTimeout(resolve, 10000));

    console.log("🔚 Closing browser...");
    await browser.close();
  }
}

// Run the automation
runWebAutomation();
