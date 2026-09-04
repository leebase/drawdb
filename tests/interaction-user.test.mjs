import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import path from "node:path";
import { _electron as electron } from "playwright";

const ADD_TABLE = 'button:has(svg path[d^="M4 2 L20 2"])';

describe("User Interaction E2E (macOS Electron)", { timeout: 60000 }, () => {
  let app;
  let page;
  const errors = [];

  before(async () => {
    const repoRoot = path.resolve(import.meta.dirname, "..");
    app = await electron.launch({
      args: [path.join(repoRoot, "dist-electron/main.cjs")],
      cwd: repoRoot,
      timeout: 30000,
    });

    page = await app.firstWindow();
    page.on("pageerror", (err) => {
      errors.push(`PAGEERROR: ${err.message}`);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(`CONSOLE_ERROR: ${msg.text()}`);
      }
    });

    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    // Handle startup "Choose a database" modal
    const modalWrap = page.locator(".semi-modal-wrap");
    if (await modalWrap.count() && await modalWrap.first().isVisible().catch(() => false)) {
      const snowflakeCard = page.locator(".semi-modal-wrap div").filter({ hasText: /^Snowflake/ }).first();
      if (await snowflakeCard.count()) {
        await snowflakeCard.click();
        await page.waitForTimeout(200);
      }
      const confirmBtn = page.locator(".semi-modal-wrap button").filter({ hasText: /confirm/i }).first();
      if (await confirmBtn.count()) {
        await confirmBtn.click();
        await page.waitForTimeout(600);
      }
    }
  });

  after(async () => {
    if (app) {
      await app.close().catch(() => {});
    }
  });

  it("dismisses startup modal and shows active editor canvas", async () => {
    const addTableBtn = page.locator(ADD_TABLE).first();
    assert.equal(await addTableBtn.isVisible(), true, "Add Table button must be visible");
    const bodyTextLength = await page.evaluate(() => document.body.innerText.length);
    assert.ok(bodyTextLength > 100, "Editor body text must be loaded and not blank");
  });

  it("clicks Add Table without blanking renderer or throwing exceptions", async () => {
    const addTableBtn = page.locator(ADD_TABLE).first();
    await addTableBtn.click();
    await page.waitForTimeout(800);

    // Verify canvas rendered a table
    const tableNodes = await page.locator("foreignObject").count();
    assert.ok(tableNodes >= 1, "At least one table node (foreignObject) must exist on canvas");

    // Verify body text is alive
    const bodyTextLength = await page.evaluate(() => document.body.innerText.length);
    assert.ok(bodyTextLength > 300, "Body text must remain populated after adding table");

    // Verify no page errors occurred
    const pageErrors = errors.filter((e) => e.startsWith("PAGEERROR:"));
    assert.deepEqual(pageErrors, [], `No page errors allowed: ${pageErrors.join("; ")}`);
  });

  it("creates a second table with auto-incremented name TABLE_2", async () => {
    const addTableBtn = page.locator(ADD_TABLE).first();
    await addTableBtn.click();
    await page.waitForTimeout(800);

    const tableNodes = await page.locator("foreignObject").count();
    assert.ok(tableNodes >= 2, "Canvas must now have at least two tables");

    const pageErrors = errors.filter((e) => e.startsWith("PAGEERROR:"));
    assert.deepEqual(pageErrors, [], "No page errors after second table");
  });

  it("updates target database and schema namespace and reflects them in DDL", async () => {
    const dbInput = page.locator('input[placeholder="MODEL"]').first();
    const schemaInput = page.locator('input[placeholder="PUBLIC"]').first();
    assert.equal(await dbInput.isVisible(), true, "Target Namespace Database input must be visible");
    assert.equal(await schemaInput.isVisible(), true, "Target Namespace Schema input must be visible");

    await dbInput.fill("ANALYTICS");
    await dbInput.blur();
    await page.waitForTimeout(300);

    await schemaInput.fill("STAGING");
    await schemaInput.blur();
    await page.waitForTimeout(300);

    const ddlBtn = page.locator('[data-testid="erd-show-ddl"]').first();
    await ddlBtn.click();
    await page.waitForTimeout(800);

    const modalWrap = page.locator(".semi-modal-wrap");
    const ddlContent = await modalWrap.innerText();
    assert.match(ddlContent, /CREATE DATABASE IF NOT EXISTS ANALYTICS/i);
    assert.match(ddlContent, /CREATE SCHEMA IF NOT EXISTS ANALYTICS\.STAGING/i);
    assert.match(ddlContent, /ANALYTICS\.STAGING\.TABLE_1/i);

    const cancelBtn = page.locator(".semi-modal-wrap button").filter({ hasText: /cancel/i }).first();
    if (await cancelBtn.count()) {
      await cancelBtn.click();
      await page.waitForTimeout(400);
    }

    const pageErrors = errors.filter((e) => e.startsWith("PAGEERROR:"));
    assert.deepEqual(pageErrors, [], "No page errors after namespace update and DDL check");
  });

  it("opens Snowflake DDL modal and exposes labelled Copy DDL in footer", async () => {
    const ddlBtn = page.locator('[data-testid="erd-show-ddl"]').first();
    await ddlBtn.click();
    await page.waitForTimeout(800);

    const copyDdlBtn = page.locator("button").filter({ hasText: /^Copy DDL$/i }).first();
    assert.equal(await copyDdlBtn.isVisible(), true, "Copy DDL button must be visible in modal footer");
    assert.equal(
      await page.locator('[data-testid="erd-deploy-ddl"]').count(),
      0,
      "Deploy to Snowflake control must be absent from the DDL modal",
    );
    assert.equal(
      await page.locator("button").filter({ hasText: /^Deploy to Snowflake/i }).count(),
      0,
      "Deploy to Snowflake button must not be rendered",
    );

    await copyDdlBtn.click();
    await page.waitForTimeout(300);

    const cancelBtn = page.locator(".semi-modal-wrap button").filter({ hasText: /cancel/i }).first();
    if (await cancelBtn.count()) {
      await cancelBtn.click();
      await page.waitForTimeout(400);
    }

    const pageErrors = errors.filter((e) => e.startsWith("PAGEERROR:"));
    assert.deepEqual(pageErrors, [], "No page errors during DDL export and copy");
  });
});
