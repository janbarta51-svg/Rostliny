# Atlas rostlin

Český atlas s 588 záznamy rostlin a 992 fotografiemi. Vyhledávání podle českého i latinského názvu, členění podle čeledí a rozbalovací galerie.

Web po aktivaci GitHub Pages: https://janbarta51-svg.github.io/Rostliny/

## První zapnutí webu

1. V **Releases → Draft a new release** vytvořte tag `v1.0`, přiložte celý soubor **Atlas-rostlin-web-opraveny.zip** (103 052 667 bajtů) a až po dokončení nahrávání klikněte na **Publish release**. Workflow **Import atlas** ověří archiv a nahraje 2 586 souborů do větve `main`.
2. Zapněte GitHub Pages podle následujícího odstavce.

V **Settings → Pages → Build and deployment → Source** vyberte **GitHub Actions**. V záložce **Actions → Publish atlas** případně spusťte **Run workflow** nebo zopakujte neúspěšný běh.

## Úpravy

- `content/plants/`: samostatný JSON pro každou rostlinu.
- `dist/images/`: fotografie a náhledy.
- `dist/index.html`, `dist/style.css`, `dist/app.js`: vzhled a ovládání.
- `.pages.yml`: připravená konfigurace Pages CMS, propojení s účtem je samostatný krok.
- `documentation/`: přehled oprav, zdrojů a importu.

Po změně dat workflow spustí `python3 build.py` a publikuje složku `dist`. Pro místní prohlížení na počítači otevřete `dist/index.html`; na mobilu používejte webový odkaz.

Barva květu a doba kvetení jsou zatím ověřeně doplněné u 11 rostlin. Filtry proto dosud nepokrývají všechny záznamy. Instalovatelná aplikace zatím není součástí této verze.

Workflow **Import atlas** slouží pouze k prvnímu přenosu ověřeného archivu; po dokončení není potřeba jej znovu spouštět.
