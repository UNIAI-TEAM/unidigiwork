"""E2E: người không có quyền chỉ thấy thông báo từ chối, không thấy form AI EXECUTION.

Chặn response của server fn getAiTaskAccess để mô phỏng 2 trạng thái RBAC:
  1. canView=false  -> hiện thông báo từ chối quyền, không có form.
  2. canManage=false -> hiện cảnh báo "chỉ có quyền xem", ẩn nút giao việc/nghiệm thu.
"""
import asyncio, json, os, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080")
TASK_ID = os.environ.get("E2E_TASK_ID", "")
SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)


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


async def stub_access(page, payload):
    async def handler(route):
        await route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(payload),
        )
    await page.route(re.compile(r"getAiTaskAccess"), handler)


async def resolve_task_id(page):
    if TASK_ID:
        return TASK_ID
    await page.goto(f"{BASE}/tasks", wait_until="domcontentloaded")
    await page.wait_for_timeout(4000)
    link = page.locator('a[href*="/tasks/"]').first
    if await link.count():
        href = await link.get_attribute("href") or ""
        m = re.search(r"/tasks/([0-9a-f-]{36})", href)
        if m:
            return m.group(1)
    return ""


async def main() -> int:
    failures = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        await restore_session(context, page)

        task_id = await resolve_task_id(page)
        if not task_id:
            print("FAILURES:\n - không tìm được task id (đặt E2E_TASK_ID)")
            await browser.close()
            return 1

        # --- Case 1: bị từ chối hoàn toàn ---
        await stub_access(page, {"canView": False, "canManage": False, "canReview": False, "reason": "DENIED"})
        await page.goto(f"{BASE}/tasks/{task_id}", wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)
        await page.screenshot(path=str(SHOTS / "denied_1_no_view.png"))

        denial = page.get_by_text(re.compile("không có quyền xem dữ liệu thực thi AI", re.I))
        if await denial.count() == 0:
            failures.append("case1: thiếu thông báo từ chối quyền")
        for label in ["Sản phẩm bàn giao mong đợi", "Tiêu chí nghiệm thu"]:
            if await page.get_by_text(label, exact=False).count():
                failures.append(f"case1: form vẫn hiển thị ({label})")
        for btn in ["Giao cho nhân sự AI", "Cập nhật giao việc", "Cho AI bắt đầu", "Nghiệm thu & hoàn tất"]:
            if await page.get_by_role("button", name=btn).count():
                failures.append(f"case1: nút không được phép vẫn hiện ({btn})")

        # --- Case 2: chỉ được xem ---
        await page.unroute(re.compile(r"getAiTaskAccess"))
        await stub_access(page, {"canView": True, "canManage": False, "canReview": False, "reason": "OK"})
        await page.goto(f"{BASE}/tasks/{task_id}", wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)
        await page.screenshot(path=str(SHOTS / "denied_2_readonly.png"))

        if await page.get_by_text(re.compile("chỉ có quyền xem", re.I)).count() == 0:
            failures.append("case2: thiếu cảnh báo chỉ có quyền xem")
        for btn in ["Giao cho nhân sự AI", "Cập nhật giao việc", "Cho AI bắt đầu", "Nghiệm thu & hoàn tất"]:
            b = page.get_by_role("button", name=btn)
            if await b.count() and await b.first.is_visible():
                failures.append(f"case2: nút quản lý vẫn hiển thị ({btn})")

        await browser.close()

    print("FAILURES:" if failures else "PASS: RBAC panel AI EXECUTION ẩn form và hiện thông báo từ chối đúng")
    for f in failures:
        print(" -", f)
    return 1 if failures else 0


sys.exit(asyncio.run(main()))
