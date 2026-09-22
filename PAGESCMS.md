# Pages CMS – Atlas rostlin

## Jak je atlas nově uspořádaný

- `content/plants/*.json` – editovatelný zdroj dat pro Pages CMS, jedna rostlina = jeden soubor.
- `dist/data/plants.json` – automaticky generovaný soubor pro web; ručně ho neupravuj.
- `dist/images/` – fotografie používané webem a Pages CMS.
- `.pages.yml` – konfigurace Pages CMS.
- `tools/build_from_cms.py` – složí 601 položek do runtime databáze, zkontroluje data a vytvoří chybějící náhledy.
- `.github/workflows/pages.yml` – po uložení změny na GitHubu automaticky znovu sestaví a publikuje web.

## Připojení

1. Nahraj tuto verzi do repozitáře `janbarta51-svg/Rostliny`.
2. Otevři https://app.pagescms.org/ a přihlas se přes GitHub.
3. Pokud Pages CMS ještě nemá přístup k repozitáři, nainstaluj jeho GitHub App pro `Rostliny`.
4. Otevři repozitář `Rostliny`, větev `main`.
5. Pages CMS načte `.pages.yml` a zobrazí kolekci **Rostliny**.

## Co lze upravovat

V CMS lze vyhledávat podle českého a latinského názvu. U každé rostliny lze měnit:

- český a latinský název,
- další české názvy,
- čeleď,
- skupinu,
- jednu nebo více barev květu,
- začátek a konec kvetení (1–12),
- fotografie,
- poznámky,
- popis a určovací znaky,
- příznak ověření / ruční kontroly.

ID existující rostliny neměň. Mazání existujících položek je v CMS záměrně vypnuté.

## Fotografie

Pages CMS ukládá fotografie do `dist/images/`. Jsou povolené WebP, JPG/JPEG a PNG.
Při publikaci build vytvoří chybějící malé náhledy do `dist/images/thumbs/`.

## Publikace

Uložení změny v Pages CMS vytvoří commit na GitHubu. Workflow **Publish atlas** pak automaticky:

1. ověří všechna data,
2. sestaví `dist/data/plants.json`,
3. vytvoří případné chybějící náhledy,
4. aktualizuje verzi offline cache,
5. publikuje složku `dist` na GitHub Pages.

Pokud validace najde např. neplatný měsíc, duplicitní latinský název nebo chybějící fotografii, publikace se zastaví místo vytvoření rozbitého webu.
