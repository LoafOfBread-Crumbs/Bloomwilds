import functools
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parent


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class BloomwildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT))
        )
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/"
        cls.playwright = sync_playwright().start()
        channel = os.environ.get("BLOOMWILD_BROWSER", "chrome")
        cls.browser = cls.playwright.chromium.launch(channel=channel, headless=True)
        cls.screenshots = Path(tempfile.mkdtemp(prefix="bloomwild-browser-tests-"))

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        print(f"\nBrowser screenshots: {cls.screenshots}")

    def setUp(self):
        self.context = self.browser.new_context(
            viewport={"width": 1440, "height": 1000}, reduced_motion="reduce"
        )
        self.context.route("https://fonts.googleapis.com/**", lambda route: route.abort())
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.goto(self.url)
        expect(self.page.locator("[data-starter]")).to_have_count(3)

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [], "Uncaught browser errors")

    def choose(self, species="spriglet"):
        self.page.locator(f'[data-starter="{species}"]').click()
        expect(self.page.locator("#game-dialog")).not_to_be_visible()

    def saved(self):
        return self.page.evaluate("JSON.parse(localStorage.getItem(BloomwildCore.SAVE_KEY))")

    def seed(self, expression):
        data = self.page.evaluate(expression)
        script = (
            "if (!sessionStorage.getItem('fixture-loaded')) {"
            f"localStorage.setItem('bloomwild-save-v1', {json.dumps(json.dumps(data))});"
            "sessionStorage.setItem('fixture-loaded', 'yes');}"
        )
        self.page.add_init_script(script)
        self.page.reload()
        expect(self.page.locator("#game-dialog")).not_to_be_visible()

    def step(self, key):
        self.page.keyboard.press(key)
        self.page.wait_for_timeout(180)

    def encounter(self):
        self.page.evaluate("Math.random = () => 0")
        for _ in range(3):
            self.step("ArrowUp")
        expect(self.page.locator("#battle-view")).to_be_visible()

    def test_core_rules_and_save_validation(self):
        results = self.page.evaluate("""() => {
            const C = BloomwildCore;
            const results = {};
            for (const id of Object.keys(C.SPECIES)) {
                const creature = C.makeCreature(id, 3);
                results[id + '-health'] = creature.hp === C.maxHP(creature);
                results[id + '-save'] = Boolean(C.parseSave(JSON.stringify(C.freshState(id))));
            }
            const a = C.makeCreature('spriglet', 3);
            const d = C.makeCreature('puddloo', 3);
            results['type-advantage'] = C.damage(a, d, true, () => .5) > C.damage(a, d, false, () => .5);
            const fullChance = C.catchChance(d);
            d.hp = 1;
            results['catch-improves'] = C.catchChance(d) > fullChance && C.catchChance(d) < 1;
            const before = C.maxHP(a);
            results['level-up'] = C.addXP(a, 54) === 1 && a.level === 4 && a.xp === 0 && a.hp > before;
            C.addXP(a, 99999);
            results['level-cap'] = a.level === 20 && a.xp === 0;
            const mutations = [
                s => s.team[0].species = '<script>',
                s => s.team[0].species = '__proto__',
                s => s.team[0].hp = -1,
                s => s.team[0].hp = 99999,
                s => s.team[0].level = 21,
                s => s.team[0].xp = 1000,
                s => s.player = { x: 16, y: 8, facing: 'down' },
                s => s.player.facing = 'bad',
                s => s.capsules = -1,
                s => s.capsules = 100,
                s => s.caught = [],
                s => s.seen = [],
                s => s.guardian = 'yes',
                s => s.reserve = Array(43).fill(C.makeCreature('spriglet')),
                s => s.team = [],
                s => s.version = 2
            ];
            mutations.forEach((mutate, i) => {
                const s = C.freshState('spriglet');
                mutate(s);
                results['reject-invalid-' + i] = C.parseSave(JSON.stringify(s)) === null;
            });
            results['reject-broken-json'] = C.parseSave('{oops') === null;
            results['reject-null'] = C.parseSave('null') === null;
            return results;
        }""")
        self.assertTrue(all(results.values()), [key for key, ok in results.items() if not ok])

    def test_every_walkable_tile_is_reachable(self):
        inaccessible = self.page.evaluate("""() => {
            const C = BloomwildCore;
            const origin = {x: 8, y: 10};
            const bad = [];
            for (let y = 0; y < C.ROWS; y++) for (let x = 0; x < C.COLS; x++) {
                if (C.walkable(x, y) && (x !== origin.x || y !== origin.y) && !C.pathTo(origin, {x, y}).length) bad.push({x, y});
            }
            return bad;
        }""")
        self.assertEqual(inaccessible, [])

    def test_starter_movement_reload_and_dialog_pause(self):
        self.page.screenshot(path=str(self.screenshots / "desktop-starters.png"))
        self.choose()
        self.assertEqual(self.saved()["team"][0]["species"], "spriglet")
        self.step("ArrowRight")
        self.page.wait_for_timeout(400)
        self.assertEqual(self.saved()["player"]["x"], 9)
        self.page.locator("#journal-tab").click()
        expect(self.page.locator(".journal-entry")).to_have_count(8)
        self.step("ArrowRight")
        self.assertEqual(self.saved()["player"]["x"], 9)
        self.page.keyboard.press("Escape")
        self.page.reload()
        expect(self.page.locator("#game-dialog")).not_to_be_visible()
        self.assertEqual(self.saved()["player"]["x"], 9)
        self.page.screenshot(path=str(self.screenshots / "desktop-world.png"), full_page=True)

    def test_click_pathfinding_and_collision(self):
        self.choose()
        box = self.page.locator("#world").bounding_box()
        self.page.locator("#world").click(position={"x": box["width"] * 10.5 / 22, "y": box["height"] * 9.5 / 14})
        self.page.wait_for_function("JSON.parse(localStorage.getItem('bloomwild-save-v1')).player.x === 10 && JSON.parse(localStorage.getItem('bloomwild-save-v1')).player.y === 9")
        self.page.locator("#camp-button").click()
        self.step("ArrowUp")
        self.step("ArrowUp")
        self.page.wait_for_timeout(400)
        self.assertEqual(self.saved()["player"]["y"], 5)
        self.page.locator("#interact-button").click()
        expect(self.page.locator("#rest-now")).to_be_visible()
        self.page.locator("#rest-now").click()
        self.assertEqual(self.saved()["player"]["y"], 6)

    def test_catch_switch_and_rest(self):
        self.seed("""() => { const s = BloomwildCore.freshState('cindlet'); s.player = {x:10,y:9,facing:'up'}; return s; }""")
        self.encounter()
        self.page.screenshot(path=str(self.screenshots / "desktop-battle.png"), full_page=True)
        self.page.locator('[data-action="catch"]').click()
        expect(self.page.locator("#leave-battle")).to_be_visible()
        expect(self.page.locator("#battle-message")).to_contain_text("new friend")
        self.page.locator("#leave-battle").click()
        save = self.saved()
        self.assertEqual(save["captures"], 1)
        self.assertEqual(len(save["team"]), 2)
        self.assertEqual(save["capsules"], 9)
        self.page.locator("#team-tab").click()
        self.page.locator('[data-member="1"]').click()
        self.assertEqual(self.saved()["team"][0]["species"], "mossbun")
        self.page.locator("#close-dialog").click()
        self.page.locator("#camp-button").click()
        self.assertEqual(self.saved()["capsules"], 10)
        self.page.reload()
        expect(self.page.locator("#journal-count")).to_have_text("2/8")

    def test_attacks_victory_and_level_up(self):
        self.seed("""() => { const s = BloomwildCore.freshState('cindlet'); s.team[0].xp=53; s.player = {x:10,y:9,facing:'up'}; return s; }""")
        self.encounter()
        for _ in range(8):
            if self.page.locator("#leave-battle").count():
                break
            self.page.locator('[data-action="typed"]').click()
            self.page.wait_for_function("document.querySelector('#leave-battle') || document.querySelector('[data-action=typed]:not(:disabled)')")
        expect(self.page.locator("#battle-message")).to_contain_text("grew to level")
        self.page.locator("#leave-battle").click()
        self.assertEqual(self.saved()["wins"], 1)
        self.assertEqual(self.saved()["team"][0]["level"], 4)
        self.assertEqual(self.saved()["capsules"], 12)

    def test_faint_switch_is_locked_until_turn_finishes(self):
        self.seed("""() => {
            const C=BloomwildCore, s=C.freshState('cindlet');
            s.team[0].hp=1; s.team.push(C.makeCreature('puddloo'));
            s.seen.push('puddloo'); s.caught.push('puddloo');
            s.player={x:10,y:9,facing:'up'}; return s;
        }""")
        self.encounter()
        self.page.locator('[data-action="attack"]').click()
        self.page.wait_for_function("document.querySelector('#ally-stat [role=progressbar]').getAttribute('aria-valuenow') === '0'")
        expect(self.page.locator("#choose-next")).to_be_disabled()
        expect(self.page.locator("#choose-next")).to_be_enabled()
        self.page.locator("#choose-next").click()
        self.page.locator('[data-member="1"]').click()
        expect(self.page.locator("#ally-stat h3")).to_contain_text("Puddloo")
        expect(self.page.locator('[data-action="attack"]')).to_be_enabled()
        self.page.locator('[data-action="flee"]').click()
        self.page.locator("#leave-battle").click()

    def test_party_wipe_recovers_without_losing_team(self):
        self.seed("""() => { const s=BloomwildCore.freshState('spriglet'); s.team[0].hp=1; s.capsules=0; s.player={x:10,y:9,facing:'up'}; return s; }""")
        self.encounter()
        expect(self.page.locator('[data-action="catch"]')).to_be_disabled()
        self.page.locator('[data-action="attack"]').click()
        expect(self.page.locator("#leave-battle")).to_be_visible()
        self.page.locator("#leave-battle").click()
        save = self.saved()
        self.assertEqual(save["player"], {"x": 5, "y": 6, "facing": "up"})
        self.assertEqual(save["team"][0]["hp"], 48)
        self.assertEqual(save["capsules"], 10)

    def test_guardian_ending(self):
        self.seed("""() => { const s=BloomwildCore.freshState('spriglet'); s.player={x:18,y:3,facing:'up'}; s.captures=1; s.visited=['Sunpetal Meadow','Amber Grove','Ripplebank']; return s; }""")
        self.page.evaluate("Math.random = () => 0")
        self.page.locator("#interact-button").click()
        self.page.locator("#meet-guardian").click()
        self.page.locator('[data-action="catch"]').click()
        self.page.locator("#leave-battle").click()
        expect(self.page.locator("#dialog-title")).to_have_text("The island feels like home.")
        self.assertTrue(self.saved()["guardian"])
        self.page.locator("#keep-exploring").click()
        expect(self.page.locator(".quest-list .done")).to_have_count(4)

    def test_reserve_swap_and_capacity(self):
        self.seed("""() => {
            const C=BloomwildCore, s=C.freshState('spriglet');
            s.team=Array.from({length:6},()=>C.makeCreature('spriglet'));
            s.player={x:10,y:9,facing:'up'}; return s;
        }""")
        self.encounter()
        self.page.locator('[data-action="catch"]').click()
        self.page.locator("#leave-battle").click()
        self.assertEqual(len(self.saved()["reserve"]), 1)
        self.page.locator("#team-tab").click()
        self.page.locator('[data-reserve="0"]').click()
        self.page.locator('[data-swap="0"]').click()
        self.assertEqual(self.saved()["team"][0]["species"], "mossbun")
        self.assertEqual(self.saved()["reserve"][0]["species"], "spriglet")

    def test_save_export_import_and_reset_confirmation(self):
        self.choose("puddloo")
        self.page.locator("#settings-button").click()
        with self.page.expect_download() as download_info:
            self.page.locator("#export-save").click()
        self.assertEqual(download_info.value.suggested_filename, "bloomwild-adventure.json")
        self.page.locator("#save-file").set_input_files({"name": "broken.json", "mimeType": "application/json", "buffer": b"{}"})
        expect(self.page.locator("#toast")).to_contain_text("valid Bloomwild save")
        self.assertEqual(self.saved()["team"][0]["species"], "puddloo")
        data = self.page.evaluate("BloomwildCore.freshState('cindlet')")
        self.page.locator("#save-file").set_input_files({"name": "backup.json", "mimeType": "application/json", "buffer": json.dumps(data).encode()})
        expect(self.page.locator("#confirm-import")).to_be_visible()
        self.assertEqual(self.saved()["team"][0]["species"], "puddloo")
        self.page.locator("#confirm-import").click()
        self.assertEqual(self.saved()["team"][0]["species"], "cindlet")
        self.page.locator("#settings-button").click()
        self.page.locator("#new-adventure").click()
        self.page.locator("#cancel-reset").click()
        self.assertEqual(self.saved()["team"][0]["species"], "cindlet")
        self.page.locator("#new-adventure").click()
        self.page.locator("#confirm-reset").click()
        self.choose("spriglet")
        self.assertEqual(self.saved()["team"][0]["species"], "spriglet")

    def test_mobile_layout_and_full_map_visibility(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.page.screenshot(path=str(self.screenshots / "mobile-starters.png"), full_page=True)
        self.choose("puddloo")
        expect(self.page.get_by_role("button", name="Field journal", exact=True)).to_be_visible()
        self.assertNotEqual(self.page.locator("#world").evaluate("el => getComputedStyle(el).objectFit"), "cover")
        self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth"), 390)
        self.page.locator('[data-direction="right"]').click()
        self.page.wait_for_timeout(400)
        self.assertEqual(self.saved()["player"]["x"], 9)
        self.page.screenshot(path=str(self.screenshots / "mobile-world.png"), full_page=True)

    def test_mobile_battle_buttons_fit(self):
        self.page.set_viewport_size({"width": 360, "height": 740})
        self.seed("""() => { const s=BloomwildCore.freshState('cindlet'); s.player={x:10,y:9,facing:'up'}; return s; }""")
        self.encounter()
        self.page.screenshot(path=str(self.screenshots / "mobile-battle.png"), full_page=True)
        panel = self.page.locator("#battle-view").bounding_box()
        for button in self.page.locator("#battle-actions button").all():
            box = button.bounding_box()
            self.assertGreaterEqual(box["x"], panel["x"])
            self.assertLessEqual(box["x"] + box["width"], panel["x"] + panel["width"] + 1)
            self.assertLessEqual(box["y"] + box["height"], panel["y"] + panel["height"] + 1)
        self.page.locator('[data-action="catch"]').click()
        self.page.locator("#leave-battle").click()
        self.assertEqual(self.saved()["captures"], 1)

    def test_storage_failure_is_nonfatal(self):
        self.page.add_init_script("Storage.prototype.setItem = function() { throw new Error('Storage disabled'); };")
        self.page.reload()
        self.choose()
        expect(self.page.locator("#save-status")).to_contain_text("Autosave unavailable")
        self.page.locator("#settings-button").click()
        expect(self.page.locator("#export-save")).to_be_enabled()
        with self.page.expect_download():
            self.page.locator("#export-save").click()

    def test_repo_subdirectory_and_local_file_load(self):
        self.choose()
        file_page = self.context.new_page()
        file_page.goto((ROOT / "index.html").as_uri())
        expect(file_page.locator("[data-starter]")).to_have_count(3)
        file_page.locator('[data-starter="cindlet"]').click()
        expect(file_page.locator("#companion-content")).to_contain_text("Cindlet")
        file_page.close()
        request_failures = []
        subpage = self.context.new_page()
        subpage.on("response", lambda response: request_failures.append(response.url) if response.status >= 400 else None)
        subpage.route("**/repository/**", lambda route: route.continue_(url=route.request.url.replace("/repository/", "/")))
        subpage.goto(self.url + "repository/")
        expect(subpage.locator("#companion-content")).to_contain_text("Spriglet")
        self.assertEqual(request_failures, [])
        subpage.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
