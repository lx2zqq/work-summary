import json
import os
import re
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:3000"
PASSWORD = os.environ.get("APP_PASSWORD")
OUT = Path(".tmp-test")
OUT.mkdir(exist_ok=True)

SECTIONS = {
    "xueqing": ["林小满：完成今日校内作业，错题已讲解。"],
    "jiaoxiao": ["林小满妈妈（微信）：沟通今日作业完成情况。"],
    "yeji": [],
    "richang": ["服务再细致一些，多关注林小满的作业状态。"],
    "xiaocheng": ["林小满的数学错题已录入小橙AI系统。"],
    "kunnan": [],
    "jiaoyan": [],
}

EMPTY_SECTIONS = {key: [] for key in SECTIONS}

DRAFT_WITH_QUESTIONS = {
    "draft": {
        "sections": EMPTY_SECTIONS,
        "questions": [
            {
                "id": "q1",
                "text": "今天有试听、续费或转介绍的进展吗？",
                "options": ["没有", "有，稍后补充"],
                "multiple": False,
                "target": "yeji",
            },
            {
                "id": "q2",
                "text": "今天和林小满妈妈通过哪些渠道沟通？",
                "options": ["微信", "电话", "面聊"],
                "multiple": True,
                "target": "jiaoxiao",
            },
        ],
        "notes": [],
    }
}

DRAFT_SECOND_ROUND = {
    "draft": {
        "sections": EMPTY_SECTIONS,
        "questions": [
            {
                "id": "q3",
                "text": "今天接待的新家长大概有几位？",
                "options": ["1位", "2-3位", "4位以上"],
                "multiple": False,
                "target": "jiaoxiao",
            }
        ],
        "notes": [],
    }
}

DRAFT_NO_QUESTIONS = {
    "draft": {
        "sections": EMPTY_SECTIONS,
        "questions": [],
        "notes": [],
    }
}

DRAFT_AFTER_ANSWERS = {
    "draft": {
        "sections": SECTIONS,
        "questions": [],
        "notes": [],
    }
}


def safe(value: str) -> str:
    return value.encode("utf-8", "replace").decode("utf-8")


def main() -> None:
    if not PASSWORD:
        raise SystemExit("请先设置 APP_PASSWORD 环境变量")

    call_count = 0
    generate_payloads: list[dict] = []
    console_errors: list[str] = []
    page_errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        context.grant_permissions(
            ["clipboard-read", "clipboard-write"], origin=BASE
        )
        page = context.new_page()

        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        # 1. 登录
        page.goto(BASE, wait_until="networkidle")
        expect(page).to_have_url(re.compile(r"/login"))
        page.locator("#password").fill(PASSWORD)
        page.get_by_role("button", name="进入").click()
        page.wait_for_url(re.compile(r"^http://localhost:3000/$"))
        page.wait_for_load_state("networkidle")
        expect(page.get_by_text("今天都做了什么？")).to_be_visible()
        expect(page.get_by_text("复盘预览")).to_be_visible()
        page.screenshot(path=str(OUT / "ui-desktop.png"), full_page=True)
        print("✓ 登录和工作台桌面布局")

        # 用固定的测试日期，避免受当天记录状态影响
        page.goto(f"{BASE}/?date=2026-11-11", wait_until="networkidle")
        page.wait_for_timeout(300)

        # 2. 手机布局
        page.set_viewport_size({"width": 390, "height": 844})
        page.reload(wait_until="networkidle")
        expect(page.get_by_role("link", name="今日复盘")).to_be_visible()
        expect(
            page.locator("button:visible").filter(
                has_text=re.compile("生成复盘|重新生成|重新分析")
            )
        ).to_have_count(1)
        overflow = page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        assert overflow <= 1, f"移动端出现横向溢出：{overflow}px"
        page.screenshot(path=str(OUT / "ui-mobile.png"), full_page=True)
        print("✓ 手机布局无横向溢出，底部操作栏正常")

        # 3. 切到没有记录的日期，模拟两阶段生成
        page.locator('input[type="date"]').fill("2026-11-11")
        page.wait_for_timeout(900)

        def handle_generate(route):
            nonlocal call_count
            call_count += 1
            generate_payloads.append(
                json.loads(route.request.post_data or "{}")
            )

            if call_count == 1:
                body = DRAFT_WITH_QUESTIONS
            elif call_count == 2:
                body = DRAFT_SECOND_ROUND
            elif call_count == 3:
                body = DRAFT_NO_QUESTIONS
            elif call_count == 4:
                body = DRAFT_AFTER_ANSWERS
            elif call_count == 5:
                body = DRAFT_WITH_QUESTIONS
            else:
                body = DRAFT_AFTER_ANSWERS

            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(body, ensure_ascii=False),
            )

        page.route("**/api/generate", handle_generate)
        page.locator("textarea").first.fill(
            "今天林小满作业写完了，错题讲了两道，跟她妈妈微信说了下，另外把小橙AI的错题录了。"
        )
        page.locator("button:visible").filter(
            has_text=re.compile("生成复盘|重新生成|重新分析")
        ).first.click()

        # 第一轮：只出追问，不显示正文
        expect(page.get_by_text("AI 想确认 2 件事")).to_be_visible(
            timeout=15000
        )
        expect(page.get_by_text("先回答上面的追问")).to_be_visible()
        expect(page.locator("pre")).to_have_count(0)
        print("✓ 追问期间不显示正文")

        # 多选：微信 + 电话
        page.get_by_role("button", name="微信").click()
        page.get_by_role("button", name="电话").click()
        page.get_by_role("button", name="提交并继续").click()
        expect(page.get_by_text("AI 想确认 1 件事")).to_be_visible(
            timeout=15000
        )

        multi_answer = next(
            (
                item["answer"]
                for item in generate_payloads[1]["answers"]
                if "哪些渠道" in item["question"]
            ),
            "",
        )
        assert "微信" in multi_answer and "电话" in multi_answer, multi_answer
        assert generate_payloads[1]["mode"] == "questions"
        print("✓ 多选追问答案包含多个选项")

        # 第二轮回答后：没有更多问题，自动生成正文
        page.get_by_role("button", name="2-3位").click()
        page.get_by_role("button", name="提交并继续").click()
        expect(page.locator("pre")).to_be_visible(timeout=20000)
        expect(page.get_by_text(re.compile("AI 想确认"))).to_have_count(0)
        assert generate_payloads[3]["mode"] == "final", generate_payloads[3]

        preview = page.locator("pre").inner_text()
        assert "2026年11月11日工作复盘" in preview, preview
        assert "🍊【学情跟进】" in preview, preview
        assert "林小满" in preview, preview
        print("✓ 回答完追问后才生成正文")

        # 4. 手动重新生成：重置追问周期
        page.locator("button:visible").filter(
            has_text=re.compile("重新生成")
        ).first.click()
        expect(page.get_by_text("AI 想确认 2 件事")).to_be_visible(
            timeout=15000
        )
        expect(page.locator("pre")).to_have_count(0)
        assert generate_payloads[4]["mode"] == "questions"
        assert generate_payloads[4]["round"] == 0
        print("✓ 手动重新生成后再次追问")

        # 5. 跳过追问，直接生成
        page.get_by_role("button", name="跳过追问并生成").first.click()
        expect(page.locator("pre")).to_be_visible(timeout=20000)
        expect(page.get_by_text(re.compile("AI 想确认"))).to_have_count(0)
        assert generate_payloads[5]["mode"] == "final"
        print("✓ 跳过追问后生成正文")

        # 6. 编辑内容
        page.get_by_role("button", name="编辑内容").click()
        expect(page.get_by_text("调整内容")).to_be_visible()
        page.locator('[role="dialog"] textarea').first.fill(
            "林小满：完成今日校内作业，错题已讲解，并跟老师对接了后续安排。"
        )
        page.get_by_role("button", name="保存修改").click()
        page.wait_for_timeout(800)
        preview = page.locator("pre").inner_text()
        assert "并跟老师对接了后续安排" in preview, preview
        print("✓ 编辑内容并保存")

        # 7. AI 不可用时保留已有正文
        page.unroute("**/api/generate")

        def handle_fallback(route):
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(
                    {
                        "draft": {
                            "sections": {
                                **EMPTY_SECTIONS,
                                "xueqing": [
                                    "AI 兜底内容，不应覆盖已有草稿。"
                                ],
                            },
                            "questions": [],
                            "notes": ["AI 暂时不可用，已按原文生成草稿。"],
                        },
                        "fallback": True,
                        "warning": "AI 暂时不可用，已按原文生成草稿。",
                    },
                    ensure_ascii=False,
                ),
            )

        page.route("**/api/generate", handle_fallback)
        before = page.locator("pre").inner_text()
        page.get_by_role("button", name="重新生成").first.click()
        expect(
            page.get_by_text(re.compile("AI 暂时不可用|已按原文"))
        ).to_be_visible(timeout=15000)
        page.wait_for_timeout(500)
        after = page.locator("pre").inner_text()
        assert after == before, "AI 不可用时应保留当前正文"
        page.unroute("**/api/generate")
        print("✓ AI 不可用时保留已有正文")

        # 8. 复制
        page.get_by_role("button", name="复制", exact=True).first.click()
        expect(page.get_by_text("已复制，去钉钉粘贴吧")).to_be_visible()
        clipboard = page.evaluate("navigator.clipboard.readText()")
        assert clipboard.startswith("学管部工作复盘⬇️"), clipboard
        assert "2026年11月11日工作复盘" in clipboard, clipboard
        page.screenshot(
            path=str(OUT / "ui-mobile-generated.png"), full_page=True
        )
        print("✓ 一键复制到剪贴板")

        # 9. 历史
        page.goto(f"{BASE}/history", wait_until="networkidle")
        expect(page.get_by_text("2026年11月11日").first).to_be_visible()
        print("✓ 历史列表包含生成的复盘")

        # 10. 学生管理
        page.goto(f"{BASE}/students", wait_until="networkidle")
        expect(page.get_by_text("林小满").first).to_be_visible()
        page.get_by_role("button", name="添加学生").click()
        page.locator("#student-name").fill("测试学生")
        page.get_by_role("button", name="添加", exact=True).click()
        expect(page.get_by_text("测试学生").first).to_be_visible()
        page.get_by_role("button", name="删除 测试学生").click()
        page.get_by_role("button", name="确认删除").click()
        expect(page.get_by_text("测试学生")).to_have_count(0)
        print("✓ 学生添加与删除")

        # 11. 设置开关
        page.goto(f"{BASE}/settings", wait_until="networkidle")
        preview_locator = page.locator("pre").first

        kunnan = page.get_by_role("switch", name="工作困难")
        if kunnan.get_attribute("aria-checked") == "true":
            kunnan.click()
            page.wait_for_timeout(700)
        assert "🍊【工作困难】" not in preview_locator.inner_text()
        kunnan.click()
        page.wait_for_timeout(700)
        assert "🍊【工作困难】" in preview_locator.inner_text()
        kunnan.click()
        page.wait_for_timeout(700)
        assert "🍊【工作困难】" not in preview_locator.inner_text()

        fixed = page.get_by_role("switch", name="固定话术")
        if fixed.get_attribute("aria-checked") == "true":
            fixed.click()
            page.wait_for_timeout(700)
        assert "做更优质的服务" not in preview_locator.inner_text()
        fixed.click()
        page.wait_for_timeout(700)
        assert "做更优质的服务" in preview_locator.inner_text()
        fixed.click()
        page.wait_for_timeout(700)
        assert "做更优质的服务" not in preview_locator.inner_text()
        page.screenshot(path=str(OUT / "ui-settings.png"), full_page=True)
        print("✓ 设置开关与模板预览联动")

        # 12. 桌面截图
        page.set_viewport_size({"width": 1280, "height": 900})
        page.goto(f"{BASE}/?date=2026-11-11", wait_until="networkidle")
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "ui-desktop-generated.png"), full_page=True)

        browser.close()

    if console_errors:
        print("Console errors:")
        for item in console_errors:
            print(" -", safe(item))
    if page_errors:
        print("Page errors:")
        for item in page_errors:
            print(" -", safe(item))

    assert not page_errors, f"页面运行错误：{safe(str(page_errors))}"
    assert not console_errors, f"控制台错误：{safe(str(console_errors))}"
    print("✓ UI 测试全部通过")


if __name__ == "__main__":
    main()
