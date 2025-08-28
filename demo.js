import { chromium } from "playwright";

/**
 * Demo script showing basic browser automation capabilities
 * This can run without OpenAI API key for basic testing
 */

console.log("🎬 Starting WebPilot Demo...");

const browser = await chromium.launch({
  headless: false,
  slowMo: 1000, // Slow down for demo visibility
  args: [
    "--ignore-certificate-errors",
    "--ignore-ssl-errors",
    "--ignore-certificate-errors-spki-list",
  ],
});

const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });

// Ignore SSL certificate errors
await page.context().setExtraHTTPHeaders({
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
});

try {
  console.log("🔗 Navigating to narinder.in...");

  // Try with different strategies
  try {
    await page.goto("https://narinder.in", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
  } catch (error) {
    console.log("⚠️  HTTPS failed, trying HTTP...");
    await page.goto("http://narinder.in", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
  }

  console.log("📸 Taking screenshot...");
  await page.screenshot({
    path: "demo-screenshot-1.png",
    fullPage: true,
  });

  console.log("🔍 Analyzing page structure for contact sections...");

  // Get page information focused on contact elements
  const pageInfo = await page.evaluate(() => {
    const title = document.title;
    const url = window.location.href;

    // Find contact-related elements
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

    // Find forms (especially contact forms)
    const forms = Array.from(document.querySelectorAll("form"));
    const formInfo = forms.map((form, index) => {
      const inputs = Array.from(
        form.querySelectorAll("input, select, textarea")
      );
      const isContactForm = inputs.some((input) =>
        /name|email|message|subject|phone/i.test(
          input.name || input.placeholder || input.id || ""
        )
      );

      return {
        formIndex: index,
        formId: form.id || null,
        formClass: form.className || null,
        action: form.action || null,
        method: form.method || "GET",
        isContactForm: isContactForm,
        inputs: inputs.map((input) => ({
          type: input.type || input.tagName.toLowerCase(),
          name: input.name || null,
          id: input.id || null,
          placeholder: input.placeholder || null,
          required: input.required || false,
          value: input.value || null,
        })),
      };
    });

    // Find contact sections
    const contactSections = Array.from(
      document.querySelectorAll('[id*="contact"], [class*="contact"], section')
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
        hasForm: section.querySelector("form") !== null,
        text: section.textContent?.substring(0, 100) + "..." || "",
      }));

    return {
      title,
      url,
      forms: formInfo,
      contactLinks,
      contactSections,
    };
  });

  console.log("📋 Page Analysis Results:");
  console.log("Title:", pageInfo.title);
  console.log("URL:", pageInfo.url);
  console.log("Forms found:", pageInfo.forms.length);
  console.log("Contact links found:", pageInfo.contactLinks.length);
  console.log("Contact sections found:", pageInfo.contactSections.length);

  // Display contact links
  if (pageInfo.contactLinks.length > 0) {
    console.log("\n📞 Contact links found:");
    pageInfo.contactLinks.forEach((link, index) => {
      console.log(`  ${index + 1}. "${link.text}" → ${link.href}`);
    });
  }

  // Display contact sections
  if (pageInfo.contactSections.length > 0) {
    console.log("\n📧 Contact sections found:");
    pageInfo.contactSections.forEach((section, index) => {
      console.log(
        `  ${index + 1}. ${section.tagName} - ID: ${
          section.id || "None"
        }, Class: ${section.className || "None"}`
      );
      console.log(`     Has form: ${section.hasForm}`);
    });
  }

  // Display forms (especially contact forms)
  if (pageInfo.forms.length > 0) {
    pageInfo.forms.forEach((form, index) => {
      console.log(
        `\n📝 Form ${index + 1} ${form.isContactForm ? "(CONTACT FORM)" : ""}:`
      );
      console.log(`  ID: ${form.formId || "None"}`);
      console.log(`  Class: ${form.formClass || "None"}`);
      console.log(`  Action: ${form.action || "None"}`);
      console.log(`  Method: ${form.method}`);
      console.log(`  Inputs: ${form.inputs.length}`);

      form.inputs.forEach((input, inputIndex) => {
        console.log(
          `    ${inputIndex + 1}. ${input.type} - ${
            input.name || input.id || "unnamed"
          } ${input.placeholder ? `(${input.placeholder})` : ""}`
        );
      });
    });
  }

  // Try to navigate to contact section or fill contact form
  const contactForms = pageInfo.forms.filter((form) => form.isContactForm);

  if (contactForms.length > 0) {
    console.log(
      `\n🎯 Found ${contactForms.length} contact form(s), attempting to fill the first one...`
    );
    const contactForm = contactForms[0];

    for (const input of contactForm.inputs) {
      try {
        const selector = input.id
          ? `#${input.id}`
          : `input[name="${input.name}"]`;

        if (
          input.type === "email" ||
          /email/i.test(input.name || input.placeholder || "")
        ) {
          console.log(`📧 Filling email field: ${selector}`);
          await page.fill(selector, "john.doe@example.com");
        } else if (/name/i.test(input.name || input.placeholder || "")) {
          console.log(`� Filling name field: ${selector}`);
          await page.fill(selector, "John Doe");
        } else if (/phone|tel/i.test(input.name || input.placeholder || "")) {
          console.log(`📱 Filling phone field: ${selector}`);
          await page.fill(selector, "+1-555-123-4567");
        } else if (
          input.type === "textarea" ||
          /message|comment/i.test(input.name || input.placeholder || "")
        ) {
          console.log(`💬 Filling message field: ${selector}`);
          await page.fill(
            selector,
            "Hello, this is a test message from the automation agent. I am testing the contact form functionality."
          );
        } else if (/subject/i.test(input.name || input.placeholder || "")) {
          console.log(`� Filling subject field: ${selector}`);
          await page.fill(selector, "Test Contact Form Submission");
        }

        await page.waitForTimeout(500); // Small delay for visibility
      } catch (error) {
        console.log(`⚠️  Could not fill ${input.type} field: ${error.message}`);
      }
    }
  } else if (pageInfo.contactLinks.length > 0) {
    console.log(
      "\n� No contact form found on current page, trying to navigate to contact page..."
    );
    const firstContactLink = pageInfo.contactLinks[0];
    console.log(`Clicking on: "${firstContactLink.text}"`);

    try {
      await page.click(`a[href="${firstContactLink.href}"]`);
      await page.waitForTimeout(2000);
      console.log("�📸 Taking screenshot after navigation...");
      await page.screenshot({
        path: "demo-screenshot-contact-page.png",
        fullPage: true,
      });
    } catch (error) {
      console.log(`⚠️  Could not click contact link: ${error.message}`);
    }
  }

  console.log("📸 Taking final screenshot...");
  await page.screenshot({
    path: "demo-screenshot-2.png",
    fullPage: true,
  });

  console.log("\n✅ Contact demo completed successfully!");
  console.log("📸 Screenshots saved as demo-screenshot-*.png");
} catch (error) {
  console.error("❌ Demo failed:", error.message);
} finally {
  console.log("🔚 Keeping browser open for 5 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log("🔚 Closing browser...");
  await browser.close();
}

console.log("🎬 Demo finished!");
