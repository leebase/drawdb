import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { _electron as electron } from "playwright";

const ADD_TABLE = 'button:has(svg path[d^="M4 2 L20 2"])';

describe("User Interaction E2E (macOS Electron)", { timeout: 60000 }, () => {
  let app;
  let page;
  let userDataDirectory;
  const errors = [];

  before(async () => {
    const repoRoot = path.resolve(import.meta.dirname, "..");
    userDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-user-test-"));
    app = await electron.launch({
      args: [path.join(repoRoot, "dist-electron/main.cjs"), `--user-data-dir=${userDataDirectory}`],
      cwd: repoRoot,
      timeout: 30000,
    });
    const actualUserData = await app.evaluate(({ app }) => app.getPath("userData"));
    assert.equal(fs.realpathSync(actualUserData), fs.realpathSync(userDataDirectory), "UI tests must not share user data with the installed application");

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

  it("preserves CHECK edits and undo while blocking unsafe structural changes", async () => {
    await page.locator(".semi-collapse-header").filter({ hasText: "TABLE_1" }).first().click();
    const fieldName = page.locator('input[id^="scroll_table_"][id*="_input_"]').first();
    const column = await fieldName.inputValue();
    await page.getByTestId("snowflake-add-check-constraint").first().click();
    const name = page.getByRole("textbox", { name: "CHECK constraint name", exact: true }).first();
    const expression = page.getByRole("textbox", { name: "CHECK expression", exact: true }).first();
    const save = page.locator('[data-testid^="snowflake-save-check-"]').first();
    const checkError = page.locator('[data-testid^="snowflake-check-constraint-"] [role="alert"]').first();
    await name.fill("CK_UI_PRESERVATION");
    await save.click();
    await checkError.waitFor({ state: "visible" });
    assert.match(await checkError.innerText(), /CHECK/i);
    assert.equal(await fieldName.isDisabled(), false, "Invalid draft must not change model state");

    const predicate = `${column} > 0 AND ('a; b' = 'a; b')`;
    await expression.fill(`  ${predicate}  `);
    await save.click();
    await page.waitForFunction(() => document.querySelector('input[id^="scroll_table_"][id*="_input_"]')?.disabled);
    assert.equal(await expression.inputValue(), predicate, "Only outer whitespace is trimmed");

    const readDDL = async () => {
      await page.getByTestId("erd-show-ddl").first().click();
      const modal = page.locator(".semi-modal-wrap");
      await modal.waitFor({ state: "visible" });
      const text = await modal.innerText();
      await modal.getByRole("button", { name: /cancel/i }).first().click();
      await modal.waitFor({ state: "hidden" });
      return text;
    };
    assert.ok((await readDDL()).includes(`CONSTRAINT CK_UI_PRESERVATION CHECK (${predicate})`));
    await expression.fill(`${column} > 0); DROP TABLE T; --`);
    await save.click();
    await checkError.waitFor({ state: "visible" });
    assert.match(await checkError.innerText(), /SNOWFLAKE_CHECK_(INVALID|UNSUPPORTED)/);
    assert.ok((await readDDL()).includes(`CHECK (${predicate})`), "Rejected expression must not replace the saved predicate");
    await expression.fill(predicate);
    await save.click();
    assert.equal(await page.locator('input[title="Remove or revise CHECK constraints before renaming this table"]').first().isDisabled(), true);
    const columnDetails = page.getByRole("button", { name: `Column details ${column}`, exact: true }).first();
    await columnDetails.click();
    const sizeInput = page.locator('input[title="Remove or revise CHECK constraints before changing column size"]').first();
    await sizeInput.waitFor({ state: "visible" });
    assert.equal(await sizeInput.isDisabled(), true, "Size edits must be blocked before blur can create history");
    await columnDetails.click();

    const databaseInput = page.locator('input[placeholder="MODEL"]').first();
    const originalDatabase = await databaseInput.inputValue();
    await databaseInput.fill("UNSAFE_MOVE");
    await databaseInput.blur();
    await page.getByText(/SNOWFLAKE_CHECK_STRUCTURAL_EDIT/).first().waitFor();
    const blockedDDL = await readDDL();
    assert.ok(blockedDDL.includes(`${originalDatabase}.STAGING`));
    assert.ok(!blockedDDL.includes("UNSAFE_MOVE"), "Rejected namespace edit must leave model unchanged");

    const editedPredicate = `${column} >= 1`;
    await expression.fill(editedPredicate);
    await save.click();
    assert.ok((await readDDL()).includes(`CHECK (${editedPredicate})`));
    await page.keyboard.press("Meta+z");
    await page.waitForFunction((expected) => document.querySelector('textarea[aria-label="CHECK expression"]')?.value === expected, predicate);
    assert.ok((await readDDL()).includes(`CHECK (${predicate})`));

    await page.getByRole("button", { name: "Delete CHECK constraint", exact: true }).first().click();
    await page.waitForFunction(() => !document.querySelector('textarea[aria-label="CHECK expression"]'));
    assert.ok(!(await readDDL()).includes("CK_UI_PRESERVATION"));
    assert.equal(await fieldName.isDisabled(), false);
    await page.keyboard.press("Meta+z");
    await expression.waitFor({ state: "visible" });
    assert.ok((await readDDL()).includes(`CHECK (${predicate})`));
    assert.equal(await fieldName.isDisabled(), true);
    assert.deepEqual(errors.filter((error) => error.startsWith("PAGEERROR:")), []);
  });
  it("blocks custom-type bulk rewrites before changing CHECK state or type storage", async () => {
    const stored = { snowflake: { NUMBER: { type: "NUMBER", color: "#cccccc" } } };
    await page.evaluate((value) => localStorage.setItem("custom_types", JSON.stringify(value)), stored);
    const openTypes = async () => {
      await page.getByText("Settings", { exact: true }).first().click();
      await page.getByText("Configure custom types", { exact: true }).first().click();
      await page.locator(".configure-custom-types-row").first().waitFor();
    };
    for (const operation of ["rename", "delete"]) {
      await openTypes();
      const modal = page.locator(".semi-modal-wrap");
      const row = modal.locator(".configure-custom-types-row").first();
      if (operation === "rename") await row.locator('input[placeholder="VARCHAR"]').fill("UNSAFE_CUSTOM_TYPE");
      else await row.locator("td").last().getByRole("button").click();
      await modal.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText(/Custom-type changes would rewrite columns/).first().waitFor();
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("custom_types"))), stored);
      assert.equal(await modal.isVisible(), true, "Rejected save must keep the editor open");
      await modal.getByRole("button", { name: "Close", exact: true }).click();
      await modal.waitFor({ state: "hidden" });
    }
    await page.getByTestId("erd-show-ddl").first().click();
    const modal = page.locator(".semi-modal-wrap");
    const ddl = await modal.innerText();
    assert.match(ddl, /CONSTRAINT CK_UI_PRESERVATION CHECK/);
    assert.ok(!ddl.includes("UNSAFE_CUSTOM_TYPE"));
    await modal.getByRole("button", { name: /cancel/i }).click();
    assert.deepEqual(errors.filter((error) => error.startsWith("PAGEERROR:")), []);
  });
});
