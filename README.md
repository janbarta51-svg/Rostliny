# Atlas rostlin – PWA pracovní verze (úkoly 1–4)

Hotovo:
1. Web načítá jediný runtime datový soubor `dist/data/plants.json` (601 rostlin).
2. Všech 1 064 fotografií je převedeno do WebP. Plný obrázek má max. 1600 px, pro seznam existuje samostatný náhled max. 420×320 px.
3. Funguje vyhledávání CZ/latinsky, filtrování podle skupiny, čeledi, barvy, konkrétního měsíce, „Kvete právě teď“, jen s fotografiemi a řazení podle taxonomie / českého / latinského názvu.
4. Atlas je PWA: má manifest, ikony, service worker, instalaci na plochu a offline režim.

## Offline režim
- Aplikace, `plants.json`, CSS, JavaScript a ikony se ukládají automaticky po prvním načtení přes HTTPS nebo localhost.
- Tlačítko **Fotky offline** stáhne všech 1 064 plných fotografií a 1 064 náhledů (cca 70 MB). Průběh se zobrazuje přímo v aplikaci.
- Plné fotografie, které uživatel otevře běžně, se také průběžně ukládají do cache.
- Stav Online/Offline je vidět v horní liště.

## Instalace
- Android / Chrome / Edge: po splnění podmínek se objeví tlačítko **Instalovat**.
- iPhone / iPad: Safari → Sdílet → Přidat na plochu.
- GitHub Pages používá HTTPS, takže je pro PWA vhodný.

## Lokální spuštění ve Windows
Dvakrát klikni na `START-ATLAS.bat` nebo `AtlasServer.exe`. Nový spouštěč má vlastní malý webový server, takže **není potřeba Python ani jiný program**. Automaticky otevře atlas na `http://localhost:8000/` (případně dalším volném portu 8001–8010).

Okno `AtlasServer.exe` nech otevřené po dobu používání atlasu. Jeho zavřením lokální atlas vypneš.

Přímé otevření `dist/index.html` přes `file://` není podporované: service worker i `fetch()` potřebují HTTPS nebo localhost.

## Zdroj pravdy
Master databáze zůstává `/mnt/data/atlas_work/data/plants.json`. Skript `tools/build_web.py` z masteru vytvoří webovou kopii `dist/data/plants.json` a optimalizované fotografie z Wordu.

## Pages CMS

Tato verze je připravená pro Pages CMS. Editovatelným zdrojem jsou soubory `content/plants/*.json`; webový `dist/data/plants.json` se generuje automaticky. Podrobný postup je v `PAGESCMS.md`.
