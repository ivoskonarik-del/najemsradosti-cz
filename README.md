# najemsradosti.cz – Nájem s radostí (Mgr. Tomáš Veigl)

Web je statický export Next.js (zdrojáky Next.js nemáme). Od 10. 10. 2026 má administraci článků a návštěvnosti.

- Větev `main` = zdroj, GitHub Action (`.github/workflows/deploy.yml`) spustí `python _build/build.py` a nasadí `_site/` na GitHub Pages (doména najemsradosti.cz).
- Větev `gh-pages` = původní ruční nasazení (už se nepoužívá), záloha před úpravami: `backup-2026-10-10`.
- Články: `_data/posts.json` (slug, title, date, excerpt, image, imageAlt, category, author, body = HTML z editoru, hidden).
- Build generuje `/novinky/<slug>/`, výpis `/novinky/` a blok Novinky na úvodní stránce – HTML i RSC payload (index.txt a self.__next_f v HTML), aby React při hydrataci nepřepsal obsah. Šablony: `_build/sablony/clanek` (původní článek), `_build/sablony/novinky`, úvod = `index.html` v kořeni. Ostatní stránky se kopírují beze změny.
- Do všech stránek build vkládá `/stats.js` (měření návštěvnosti bez cookies → webhunter-admin `/api/najemsradosti/hit`).
- Administrace `/admin/` (heslo výchozí `admin`) ukládá přes společný backend ~/webhunter-admin (KV `site:najemsradosti`, Worker má zápis do repa přes účet webhunter-navrhy – spolupracovník repa).
- Lokálně: `python3 _build/build.py && python3 -m http.server -d _site 8790`
