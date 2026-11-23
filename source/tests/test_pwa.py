"""Проверка офлайн-сборки: манифест, значки, service worker со всеми файлами, теги в страницах."""
import json, os, re, tempfile, unittest, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import build_web as bw


class PwaBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = os.path.join(tempfile.mkdtemp(), "w")
        bw.build_web(cls.out)

    def test_manifest_and_icons(self):
        m = json.load(open(os.path.join(self.out, "manifest.webmanifest"), encoding="utf-8"))
        self.assertEqual(m["display"], "standalone")
        self.assertEqual(m["start_url"], "index.html")
        for ic in m["icons"]:
            self.assertTrue(os.path.getsize(os.path.join(self.out, ic["src"])) > 500, ic["src"])
        self.assertTrue(os.path.exists(os.path.join(self.out, "icons", "apple-touch-icon.png")))

    def test_sw_lists_every_file(self):
        sw = open(os.path.join(self.out, "sw.js"), encoding="utf-8").read()
        files = json.loads(re.search(r"const FILES = (\[.*?\]);", sw, re.S).group(1))
        self.assertNotIn("__", sw.replace("__proto__", ""))
        for f in files:
            if f != "./":
                self.assertTrue(os.path.exists(os.path.join(self.out, f)), f)
        for n in bw.PAGES:
            self.assertIn(n + ".html", files)
        for j in bw.JS_FILES:
            self.assertIn("js/" + j, files)
        self.assertIn("pwa.js", " ".join(files))

    def test_update_files(self):
        v = json.load(open(os.path.join(self.out, "version.json"), encoding="utf-8"))
        from sim import VERSION
        self.assertEqual(v["version"], VERSION)
        self.assertTrue(v["notes"], "в README нет раздела «Что нового» для текущей версии")
        js = open(os.path.join(self.out, "version.js"), encoding="utf-8").read()
        self.assertTrue(js.startswith("window.LG_REMOTE = "))
        meta = json.load(open(os.path.join(self.out, "app-files.json"), encoding="utf-8"))
        self.assertEqual(meta["info"]["version"], VERSION)
        for f in meta["files"]:
            self.assertTrue(os.path.exists(os.path.join(self.out, f)), f)
        for need in ("index.html", "settings.html", "updates.html", "update-source.html", "sw.js", "js/zip.js", "js/updater.js", "version.json"):
            self.assertIn(need, meta["files"])
        sw = open(os.path.join(self.out, "sw.js"), encoding="utf-8").read()
        files = json.loads(re.search(r"const FILES = (\[.*?\]);", sw, re.S).group(1))
        self.assertNotIn("version.json", files)      # версия на сайте не должна читаться из кэша
        self.assertIn("version\\.(json|js)", sw)

    def test_update_pages_scripts_once(self):
        for n in ("settings", "updates", "update-source"):
            h = open(os.path.join(self.out, n + ".html"), encoding="utf-8").read()
            self.assertEqual(h.count("js/updater.js"), 1, n)
            self.assertLess(h.index("js/pwa.js"), h.index("js/common.js"), n)
        h = open(os.path.join(self.out, "settings.html"), encoding="utf-8").read()
        self.assertEqual(h.count("js/zip.js"), 1)

    def test_pages_have_tags(self):
        for n in bw.PAGES:
            h = open(os.path.join(self.out, n + ".html"), encoding="utf-8").read()
            self.assertIn('rel="manifest"', h, n)
            self.assertIn("js/pwa.js", h, n)
            self.assertLess(h.index("js/local-api.js"), h.index("js/pwa.js"), n)


if __name__ == "__main__":
    unittest.main()
