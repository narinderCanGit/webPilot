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
  slowMo: 200, // Faster for better performance while still visible
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
  description:
    "Fill an input field with text using CSS selector with visible cursor movement",
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

      // Scroll to element to ensure it's visible
      await page.locator(input.selector).scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

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

      // Click to focus the field - this shows cursor movement
      await page.click(input.selector);
      await page.waitForTimeout(200);

      // Clear the field completely first with visible actions
      await page.keyboard.down("Control"); // or 'Meta' on Mac
      await page.keyboard.press("a"); // Select all - shows selection
      await page.waitForTimeout(100);
      await page.keyboard.up("Control");
      await page.keyboard.press("Delete"); // Delete selected content
      await page.waitForTimeout(100);

      // Now type the new value character by character for visibility
      for (let i = 0; i < input.text.length; i++) {
        await page.keyboard.type(input.text[i]);
        await page.waitForTimeout(15); // Faster delay between characters
      }

      // Verify the value was set correctly
      await page.waitForTimeout(200); // Faster wait for the value to be set
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

const findAuthForm = tool({
  name: "find_auth_form",
  description:
    "Look for auth-sada forms, login sections, or signin links on the current page",
  parameters: z.object({}),
  async execute() {
    const authInfo = await page.evaluate(() => {
      // Look for auth-sada and authentication-related text and elements
      const authKeywords =
        /auth-sada|login|signin|sign.?in|auth|authenticate|log.?in|register|signup|sign.?up/i;

      // Find authentication links with priority to auth-sada
      const authLinks = Array.from(document.querySelectorAll("a"))
        .filter(
          (link) =>
            /auth-sada/i.test(link.textContent || "") ||
            /auth-sada/i.test(link.className || "") ||
            /auth-sada/i.test(link.id || "") ||
            link.href.includes("auth-sada") ||
            authKeywords.test(link.textContent || "") ||
            authKeywords.test(link.title || "") ||
            link.href.includes("login") ||
            link.href.includes("signin") ||
            link.href.includes("auth")
        )
        .map((link) => ({
          text: link.textContent?.trim() || "",
          href: link.href,
          selector: link.id
            ? `#${link.id}`
            : link.className
            ? `.${link.className.split(" ")[0]}`
            : null,
          isAuthSada: /auth-sada/i.test(
            link.textContent || link.className || link.id || link.href
          ),
        }));

      // Find auth-sada forms and authentication forms
      const authForms = Array.from(document.querySelectorAll("form"))
        .filter((form) => {
          const hasAuthSada =
            /auth-sada/i.test(form.className || "") ||
            /auth-sada/i.test(form.id || "");
          const inputs = Array.from(form.querySelectorAll("input"));
          const hasAuthInputs = inputs.some((input) =>
            /email|username|password|login|signin/i.test(
              input.name || input.placeholder || input.id || input.type || ""
            )
          );
          return hasAuthSada || hasAuthInputs;
        })
        .map((form, index) => ({
          formIndex: index,
          id: form.id,
          className: form.className,
          selector: form.id
            ? `#${form.id}`
            : form.className
            ? `.${form.className.split(" ")[0]}`
            : `form:nth-of-type(${index + 1})`,
          isAuthSada:
            /auth-sada/i.test(form.className || "") ||
            /auth-sada/i.test(form.id || ""),
          inputs: Array.from(form.querySelectorAll("input")).map((input) => ({
            type: input.type || "text",
            name: input.name,
            id: input.id,
            placeholder: input.placeholder,
            selector: input.id
              ? `#${input.id}`
              : input.name
              ? `[name="${input.name}"]`
              : null,
            isEmail:
              input.type === "email" ||
              /email/i.test(input.name || input.placeholder || input.id || ""),
            isPassword: input.type === "password",
            isUsername: /username|user|login/i.test(
              input.name || input.placeholder || input.id || ""
            ),
          })),
        }));

      // Find sections with auth-sada or auth-related id or class
      const authSections = Array.from(
        document.querySelectorAll(
          '[id*="auth-sada"], [class*="auth-sada"], [id*="login"], [id*="signin"], [id*="auth"], [class*="login"], [class*="signin"], [class*="auth"], section'
        )
      )
        .filter(
          (section) =>
            /auth-sada/i.test(section.className || "") ||
            /auth-sada/i.test(section.id || "") ||
            authKeywords.test(section.textContent || "") ||
            /login|signin|auth/i.test(section.id || "") ||
            /login|signin|auth/i.test(section.className || "")
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
          isAuthSada:
            /auth-sada/i.test(section.className || "") ||
            /auth-sada/i.test(section.id || ""),
        }));

      return {
        authLinks,
        authForms,
        authSections,
        foundAuthElements:
          authLinks.length > 0 ||
          authForms.length > 0 ||
          authSections.length > 0,
        foundAuthSada:
          authLinks.some((l) => l.isAuthSada) ||
          authForms.some((f) => f.isAuthSada) ||
          authSections.some((s) => s.isAuthSada),
      };
    });

    return authInfo;
  },
});

const findAndFillAllFields = tool({
  name: "find_and_fill_all_fields",
  description:
    "Find all form fields and fill them systematically with appropriate test data",
  parameters: z.object({
    formSelector: z
      .string()
      .nullable()
      .optional()
      .describe(
        "CSS selector of the form (optional - will find forms automatically)"
      ),
  }),
  async execute(input) {
    try {
      console.log(`🔍 Finding all form fields to fill...`);

      // Find all forms and their fields
      const formsData = await page.evaluate((formSelector) => {
        let forms;
        if (formSelector) {
          const specificForm = document.querySelector(formSelector);
          forms = specificForm ? [specificForm] : [];
        } else {
          forms = Array.from(document.querySelectorAll("form"));
        }

        return forms
          .map((form, formIndex) => {
            const fields = Array.from(
              form.querySelectorAll("input, textarea, select")
            )
              .map((field, fieldIndex) => {
                return {
                  tagName: field.tagName.toLowerCase(),
                  type: field.type || "text",
                  name: field.name || "",
                  id: field.id || "",
                  placeholder: field.placeholder || "",
                  required: field.required || false,
                  value: field.value || "",
                  selector: field.id
                    ? `#${field.id}`
                    : field.name
                    ? `[name="${field.name}"]`
                    : `form:nth-of-type(${
                        formIndex + 1
                      }) ${field.tagName.toLowerCase()}:nth-of-type(${
                        fieldIndex + 1
                      })`,
                  fieldIndex: fieldIndex,
                  isVisible: field.offsetParent !== null,
                  isEmail:
                    field.type === "email" ||
                    /email/i.test(field.name || field.placeholder || field.id),
                  isPassword: field.type === "password",
                  isUsername: /username|user|login/i.test(
                    field.name || field.placeholder || field.id
                  ),
                  isName:
                    /name|fullname|firstname|lastname/i.test(
                      field.name || field.placeholder || field.id
                    ) && field.type !== "username",
                  isPhone: /phone|tel|mobile/i.test(
                    field.name || field.placeholder || field.id
                  ),
                  isMessage:
                    /message|comment|description|details/i.test(
                      field.name || field.placeholder || field.id
                    ) || field.tagName.toLowerCase() === "textarea",
                  isSubmit: field.type === "submit",
                  isButton:
                    field.type === "button" ||
                    field.tagName.toLowerCase() === "button",
                };
              })
              .filter(
                (field) => field.isVisible && !field.isSubmit && !field.isButton
              );

            return {
              formIndex,
              formId: form.id || "",
              formClass: form.className || "",
              formSelector: form.id
                ? `#${form.id}`
                : `.${form.className.split(" ")[0]}` ||
                  `form:nth-of-type(${formIndex + 1})`,
              fields: fields,
            };
          })
          .filter((form) => form.fields.length > 0);
      }, input.formSelector);

      console.log(`📊 Found ${formsData.length} forms with fillable fields`);

      if (formsData.length === 0) {
        return "No forms with fillable fields found on the page";
      }

      let filledFields = [];

      // Fill each form's fields
      for (const formData of formsData) {
        console.log(`📝 Processing form: ${formData.formSelector}`);
        console.log(`📝 Fields found: ${formData.fields.length}`);

        for (const field of formData.fields) {
          console.log(`🎯 Processing field: ${field.selector} (${field.type})`);

          let testValue = "";

          // Determine appropriate test value based on field type and context
          if (field.isEmail) {
            testValue = "testuser@example.com";
          } else if (field.isPassword) {
            testValue = "Test123";
          } else if (field.isUsername) {
            testValue = "testuser";
          } else if (field.isName) {
            if (/first/i.test(field.name || field.placeholder || field.id)) {
              testValue = "John";
            } else if (
              /last/i.test(field.name || field.placeholder || field.id)
            ) {
              testValue = "Doe";
            } else {
              testValue = "John Doe";
            }
          } else if (field.isPhone) {
            testValue = "+1-555-123-4567";
          } else if (field.isMessage) {
            testValue = "This is a test message for form automation testing.";
          } else if (field.type === "number") {
            testValue = "123";
          } else if (field.type === "url") {
            testValue = "https://example.com";
          } else if (field.type === "date") {
            testValue = "2024-01-01";
          } else if (field.type === "text" || field.type === "") {
            // Use context from name/placeholder to determine value
            if (
              /company|organization/i.test(
                field.name || field.placeholder || field.id
              )
            ) {
              testValue = "Test Company";
            } else if (
              /subject|title/i.test(field.name || field.placeholder || field.id)
            ) {
              testValue = "Test Subject";
            } else if (
              /address/i.test(field.name || field.placeholder || field.id)
            ) {
              testValue = "123 Test Street, Test City, TC 12345";
            } else {
              testValue = "Test Value";
            }
          }

          if (testValue) {
            try {
              // Scroll to field first
              await page.locator(field.selector).scrollIntoViewIfNeeded();
              await page.waitForTimeout(100);

              // Click to focus with visible cursor movement
              await page.click(field.selector);
              await page.waitForTimeout(100);

              // Clear field
              await page.keyboard.down("Control");
              await page.keyboard.press("a");
              await page.waitForTimeout(50);
              await page.keyboard.up("Control");
              await page.keyboard.press("Delete");
              await page.waitForTimeout(100);

              // Type value character by character for visibility
              for (let i = 0; i < testValue.length; i++) {
                await page.keyboard.type(testValue[i]);
                await page.waitForTimeout(10); // Faster delay between characters
              }

              // Verify the value
              const actualValue = await page.inputValue(field.selector);
              filledFields.push({
                selector: field.selector,
                type: field.type,
                expectedValue: testValue,
                actualValue: actualValue,
                success: actualValue === testValue,
              });

              console.log(`✅ Filled ${field.selector}: "${actualValue}"`);
              await page.waitForTimeout(200); // Faster pause between fields
            } catch (fieldError) {
              console.error(
                `❌ Failed to fill field ${field.selector}:`,
                fieldError.message
              );
              filledFields.push({
                selector: field.selector,
                type: field.type,
                expectedValue: testValue,
                actualValue: "",
                success: false,
                error: fieldError.message,
              });
            }
          }
        }
      }

      return {
        message: `Successfully processed ${formsData.length} forms and attempted to fill ${filledFields.length} fields`,
        filledFields: filledFields,
        formsFound: formsData.length,
        fieldsProcessed: filledFields.length,
        successfulFields: filledFields.filter((f) => f.success).length,
      };
    } catch (error) {
      console.error(`❌ Failed to find and fill fields:`, error.message);
      return `Failed to find and fill fields: ${error.message}`;
    }
  },
});

const submitForm = tool({
  name: "submit_form",
  description:
    "Submit a form by clicking the submit button with visible cursor movement",
  parameters: z.object({
    formSelector: z
      .string()
      .nullable()
      .optional()
      .describe(
        "CSS selector of the form to submit (optional - will find submit buttons automatically)"
      ),
  }),
  async execute(input) {
    try {
      console.log(
        `📤 Attempting to submit form: ${input.formSelector || "auto-detect"}`
      );

      // Find submit buttons/elements
      const submitElements = await page.evaluate((formSelector) => {
        let forms = formSelector
          ? [document.querySelector(formSelector)]
          : Array.from(document.querySelectorAll("form"));
        forms = forms.filter((form) => form !== null);

        let submitButtons = [];

        // Look for submit buttons in forms
        forms.forEach((form, formIndex) => {
          // Look for submit buttons
          const buttons = Array.from(
            form.querySelectorAll(
              'button[type="submit"], input[type="submit"], button:not([type]), button[type="button"]'
            )
          );
          buttons.forEach((btn, btnIndex) => {
            if (btn.offsetParent !== null) {
              // is visible
              submitButtons.push({
                type: "submit-button",
                selector: btn.id
                  ? `#${btn.id}`
                  : btn.className
                  ? `.${btn.className.split(" ")[0]}`
                  : `form:nth-of-type(${formIndex + 1}) button:nth-of-type(${
                      btnIndex + 1
                    })`,
                text: btn.textContent?.trim() || btn.value || "",
                formIndex: formIndex,
              });
            }
          });

          // Also look for clickable elements that might be submit buttons
          const clickableSubmits = Array.from(
            form.querySelectorAll(
              '[onclick*="submit"], [class*="submit"], [id*="submit"]'
            )
          );
          clickableSubmits.forEach((elem, elemIndex) => {
            if (elem.offsetParent !== null && !elem.disabled) {
              submitButtons.push({
                type: "clickable-submit",
                selector: elem.id
                  ? `#${elem.id}`
                  : elem.className
                  ? `.${elem.className.split(" ")[0]}`
                  : `form:nth-of-type(${formIndex + 1}) [onclick]:nth-of-type(${
                      elemIndex + 1
                    })`,
                text: elem.textContent?.trim() || elem.value || "",
                formIndex: formIndex,
              });
            }
          });
        });

        return submitButtons;
      }, input.formSelector);

      console.log(
        `🎯 Found ${submitElements.length} potential submit elements`
      );

      if (submitElements.length === 0) {
        return "No submit buttons found on the page";
      }

      // Try to submit using the first viable submit element
      for (const submitElement of submitElements) {
        try {
          console.log(
            `🖱️  Attempting to click submit: ${submitElement.selector} ("${submitElement.text}")`
          );

          // Scroll to submit button
          await page.locator(submitElement.selector).scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);

          // Highlight the button briefly (visual feedback)
          await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (element) {
              element.style.border = "3px solid red";
              setTimeout(() => {
                element.style.border = "";
              }, 1000);
            }
          }, submitElement.selector);

          // Click the submit button with visible cursor movement
          await page.click(submitElement.selector);
          await page.waitForTimeout(1000);

          console.log(
            `✅ Successfully clicked submit button: ${submitElement.selector}`
          );

          // Wait for potential page changes/responses
          await page.waitForTimeout(3000);

          return `Successfully submitted form by clicking: ${submitElement.selector} ("${submitElement.text}")`;
        } catch (clickError) {
          console.log(
            `⚠️  Failed to click ${submitElement.selector}: ${clickError.message}`
          );
          continue;
        }
      }

      // If all click attempts failed, try programmatic submission
      try {
        await page.evaluate((formSelector) => {
          const forms = formSelector
            ? [document.querySelector(formSelector)]
            : Array.from(document.querySelectorAll("form"));
          forms.forEach((form) => {
            if (form) form.submit();
          });
        }, input.formSelector);

        console.log(`✅ Submitted form programmatically`);
        await page.waitForTimeout(2000);
        return `Successfully submitted form programmatically`;
      } catch (progError) {
        return `Failed to submit form: All methods failed. Last error: ${progError.message}`;
      }
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
You are a sophisticated web automation agent that can interact with websites like a human user with VISIBLE cursor movements and step-by-step form filling.

Your current task is to:
1. Navigate to ui.chaicode.com
2. Locate the auth-sada section or authentication form automatically 
3. Fill in ALL necessary form fields with appropriate test credentials
4. Show visible cursor movement and typing actions
5. Click the submit button to complete the form

Rules and Guidelines:
- Always take a screenshot first to see the current state of the page
- After each major action, take another screenshot to verify the result
- Use find_auth_form to locate auth-sada sections and authentication forms
- PRIORITIZE auth-sada sections over general authentication sections
- Use find_and_fill_all_fields to systematically fill ALL form fields
- Make cursor movements visible and deliberate
- EXECUTE ACTIONS IMMEDIATELY when you identify what needs to be done
- DO NOT just describe what you will do - ACTUALLY DO IT
- Type character by character for better visibility
- Look for auth-sada sections, login forms, signin forms, authentication sections
- Navigate to login/signin pages if authentication is on separate pages
- Use realistic but safe test credentials for all form fields
- Be patient and wait for elements to load before interacting
- If you encounter errors, analyze the page structure and try alternative approaches
- Provide clear feedback about each step you're taking

Authentication Form Filling Strategy:
- Use find_and_fill_all_fields to automatically detect and fill ALL fields
- PRIORITIZE any forms or sections containing "auth-sada" in their class, id, or content
- For email/username fields: use "testuser@example.com" or "testuser"
- For password fields: use "Test123"
- For name fields: use "John Doe", "John", "Doe" as appropriate
- For phone fields: use "+1-555-123-4567"
- For message/textarea fields: use descriptive test messages
- For other fields: use contextually appropriate test data
- Fill fields one by one with visible cursor movement
- Verify each field is filled correctly before proceeding

Navigation and Interaction Strategy:
- First, look for auth-sada sections on the current page
- If no auth-sada section found, look for general authentication forms
- If no auth form is found, look for "Login", "Sign In", "Sign Up" navigation links
- Click on authentication links to navigate to login pages
- Use CSS selectors when possible for reliable element targeting
- Scroll to elements to ensure they're visible before interacting
- Make all cursor movements and typing visible and deliberate
- Always verify form submission by checking for success messages or page changes
- Use submit_form tool to submit forms with visible button clicking
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
    findAuthForm,
    findAndFillAllFields,
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
Complete this task step by step with VISIBLE cursor movements and comprehensive form filling:

1. Navigate to ui.chaicode.com
2. Take a screenshot to see the initial page
3. Use find_auth_form tool to locate auth-sada sections and authentication forms
4. PRIORITIZE any auth-sada sections over general authentication forms
5. If auth-sada section is found on current page, proceed to step 8
6. If no auth-sada section found, look for login/signin links and ACTUALLY CLICK them to navigate to authentication pages
7. Take a screenshot after navigation to verify you're on the authentication page
8. Use find_and_fill_all_fields tool to systematically fill ALL form fields:
   - This will automatically detect all form fields
   - Fill each field with appropriate test data based on field type
   - Show visible cursor movement and character-by-character typing
   - Verify each field is filled correctly
9. Take a screenshot after filling all fields to verify the form state
10. Use submit_form tool to submit the form with visible button clicking
11. Take a final screenshot after submission to verify results

CRITICAL REQUIREMENTS:
- DO NOT STOP after identifying forms/links - ACTUALLY PERFORM THE ACTIONS
- PRIORITIZE auth-sada sections/forms over general authentication
- Make ALL cursor movements and typing VISIBLE with deliberate pacing
- Use find_and_fill_all_fields for comprehensive field detection and filling
- Fill ALL form fields, not just username/password
- Show character-by-character typing for better visibility
- Verify each step with screenshots
- Use realistic test credentials for all field types
- Complete the entire form submission process including clicking submit
- Provide detailed feedback about each action taken

YOU MUST ACTUALLY EXECUTE THESE ACTIONS, NOT JUST PLAN THEM:
- If you find login links, CLICK them immediately
- If you find forms, FILL them completely with the tools
- If you fill forms, SUBMIT them with the submit tool
- Take screenshots throughout to show progress

TEST DATA TO USE:
- Email: testuser@example.com
- Username: testuser  
- Password: Test123
- Name fields: John Doe (or John/Doe separately)
- Phone: +1-555-123-4567
- Message/Comments: "This is a test message for form automation testing."
- Other fields: Contextually appropriate test data

FOCUS: Look specifically for "auth-sada" in class names, IDs, or content first!
    `,
      {
        maxTurns: 25,
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
