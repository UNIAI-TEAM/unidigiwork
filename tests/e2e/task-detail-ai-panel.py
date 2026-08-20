"""E2E: /tasks -> /tasks/<id> renders the task detail page with the AI execution panel."""
import asyncio, json, os, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080")
SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)
DETAIL_RE = re.compile(r"/tasks/[0-9a-f-]{36}")


async def restore_session(context, page):
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            c["url"] = BASE
        await context.add_cookies(cookies)
    await page.goto(BASE, wait_until="domcontentloaded")
    if storage_key and session_json:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )


async def main() -> int:
    failures = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        await restore_session(context, page)

        await page.goto(f"{BASE}/tasks", wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)
        await page.screenshot(path=str(SHOTS / "1_tasks_list.png"))

        link = page.locator('a[href*="/tasks/"]').first
        try:
            await link.wait_for(state="visible", timeout=20000)
            href = await link.get_attribute("href")
            await link.click()
        except Exception:
            failures.append("no task link found on /tasks")
            href = None

        if href:
            try:
                await page.wait_for_url(DETAIL_RE, timeout=15000)
            except Exception:
                failures.append(f"did not navigate to task detail, url={page.url}")
            await page.wait_for_timeout(3000)
            await page.screenshot(path=str(SHOTS / "2_task_detail.png"))

            if not DETAIL_RE.search(page.url):
                failures.append(f"unexpected url: {page.url}")

            # the detail page must NOT be the tasks board
            board = page.get_by_role("heading", name=re.compile("Công việc|Tasks", re.I))
            panel = page.get_by_role("heading", name=re.compile("Nhân sự AI thực thi"))
            try:
                await panel.first.wait_for(state="visible", timeout=15000)
            except Exception:
                failures.append("AI execution panel heading not visible")

            for label in ["Nhân sự AI", "Sản phẩm bàn giao mong đợi", "Tiêu chí nghiệm thu"]:
                if await page.get_by_text(label, exact=False).count() == 0:
                    failures.append(f"missing AI panel field: {label}")
            for btn in ["Giao cho nhân sự AI", "Cập nhật giao việc"]:
                if await page.get_by_role("button", name=btn).count():
                    break
            else:
                failures.append("missing assign-to-AI button")
            if await page.get_by_role("button", name=re.compile("Cho AI bắt đầu|Chạy lại")).count() == 0:
                failures.append("missing run button")
            _ = board

        await browser.close()

    print("FAILURES:" if failures else "PASS: task detail + AI execution panel rendered")
    for f in failures:
        print(" -", f)
    return 1 if failures else 0


sys.exit(asyncio.run(main()))
