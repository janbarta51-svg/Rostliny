#!/usr/bin/env python3
"""Build runtime plants.json from Pages CMS plant collection and prepare image thumbnails."""
from __future__ import annotations
import hashlib, json, re, sys
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / 'content' / 'plants'
FAMILIES = ROOT / 'content' / 'families.json'
DIST = ROOT / 'dist'
OUT = DIST / 'data' / 'plants.json'
IMAGES = DIST / 'images'
THUMBS = IMAGES / 'thumbs'
SW = DIST / 'service-worker.js'

ALLOWED_COLORS = {
    'bílá','žlutá','oranžová','červená','růžová','fialová','modrá','zelená','hnědá','černá',
    'červenofialová','modrofialová','růžovofialová','žlutobílá','zelenobílá','žlutozelená','červenohnědá','nekvete'
}
IMAGE_EXT = {'.webp','.jpg','.jpeg','.png'}


def fail(msg: str):
    raise SystemExit('CHYBA: ' + msg)


def normalize_photo(path: str) -> str:
    p = str(path or '').replace('\\','/').lstrip('/')
    if p.startswith('dist/'):
        p = p[5:]
    if not p.startswith('images/') or '..' in p or Path(p).suffix.lower() not in IMAGE_EXT:
        fail(f'Neplatná cesta fotografie: {path!r}')
    return p


def make_thumb(full: Path, thumb: Path):
    thumb.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(full) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ('RGB','RGBA'):
            im = im.convert('RGB')
        im.thumbnail((420, 320), Image.Resampling.LANCZOS)
        ext = thumb.suffix.lower()
        if ext == '.webp':
            im.save(thumb, 'WEBP', quality=76, method=4)
        elif ext in {'.jpg','.jpeg'}:
            if im.mode == 'RGBA':
                bg = Image.new('RGB', im.size, 'white'); bg.paste(im, mask=im.getchannel('A')); im = bg
            im.save(thumb, 'JPEG', quality=82, optimize=True)
        elif ext == '.png':
            im.save(thumb, 'PNG', optimize=True)


def main():
    if not CONTENT.is_dir(): fail('Chybí content/plants')
    family_rows = json.loads(FAMILIES.read_text(encoding='utf-8'))
    family_map = {x['latin']: x['czech'] for x in family_rows}
    plants = []
    ids = set(); latin = set(); files = sorted(CONTENT.glob('*.json'))
    if not files: fail('V content/plants nejsou žádné JSON soubory')

    thumb_created = 0
    for file in files:
        try:
            p = json.loads(file.read_text(encoding='utf-8'))
        except Exception as e:
            fail(f'{file.name}: neplatný JSON ({e})')
        for key in ('id','name_cs','name_latin','family_latin','section','flower_colors'):
            if p.get(key) in (None,'',[]): fail(f'{file.name}: chybí {key}')
        if p['id'] != file.stem:
            fail(f'{file.name}: id {p["id"]!r} neodpovídá názvu souboru {file.stem!r}')
        if not re.fullmatch(r'plant-[a-z0-9-]+', p['id']): fail(f'{file.name}: neplatné ID')
        if p['id'] in ids: fail(f'Duplicitní ID {p["id"]}')
        if p['name_latin'] in latin: fail(f'Duplicitní latinský název {p["name_latin"]}')
        ids.add(p['id']); latin.add(p['name_latin'])
        if p['family_latin'] not in family_map: fail(f'{file.name}: neznámá čeleď {p["family_latin"]}')
        p['family_cs'] = family_map[p['family_latin']]
        colors = p.get('flower_colors') or []
        bad = [c for c in colors if c not in ALLOWED_COLORS]
        if bad: fail(f'{file.name}: neplatná barva {bad}')
        nonflowering = 'nekvete' in colors
        f1, f2 = p.get('flowering_from'), p.get('flowering_to')
        if nonflowering:
            p['flowering_from'] = None; p['flowering_to'] = None
        else:
            if not isinstance(f1,int) or not 1 <= f1 <= 12: fail(f'{file.name}: flowering_from musí být 1–12')
            if not isinstance(f2,int) or not 1 <= f2 <= 12: fail(f'{file.name}: flowering_to musí být 1–12')

        photos=[]
        for raw in p.get('photos') or []:
            rel=normalize_photo(raw); full=DIST/rel
            if not full.is_file(): fail(f'{file.name}: chybí fotografie {rel}')
            photos.append(rel)
            thumb = THUMBS / Path(rel).name if Path(rel).parent == Path('images') else DIST / ('images/thumbs/' + str(Path(rel).relative_to('images')))
            if not thumb.is_file():
                make_thumb(full, thumb); thumb_created += 1
        p['photos']=photos
        # Normalize optional list/boolean/string fields so the web has a stable shape.
        for k in ('other_names_cs','habitat','notes','source_paragraphs','source_texts'):
            p[k] = p.get(k) or []
        for k in ('order_cs','order_latin','description','identification','source','name_cs_raw'):
            p[k] = p.get(k) or ''
        for k in ('verified','manual_review'):
            p[k] = bool(p.get(k,False))
        for k in ('plant_type','height_min_cm','height_max_cm'):
            p.setdefault(k,None)
        plants.append(p)

    # Preserve source taxonomy order through section/family/name; front-end can re-sort too.
    def secnum(s):
        m=re.match(r'\s*(\d+)',s or '')
        return int(m.group(1)) if m else 99
    plants.sort(key=lambda p:(secnum(p.get('section')), p.get('family_cs','').casefold(), p.get('name_latin','').casefold()))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    serialized=json.dumps(plants,ensure_ascii=False,separators=(',',':'))+'\n'
    OUT.write_text(serialized,encoding='utf-8')

    # Change the SW source whenever content/photo paths change, forcing a new PWA version on deploy.
    content_hash=hashlib.sha256(serialized.encode('utf-8')).hexdigest()[:12]
    photo_hasher=hashlib.sha256()
    for rel in sorted(x for p in plants for x in p['photos']):
        photo_hasher.update(rel.encode('utf-8')); photo_hasher.update(b'\0')
        photo_hasher.update(hashlib.sha256((DIST/rel).read_bytes()).digest())
    photo_hash=photo_hasher.hexdigest()[:12]
    if SW.is_file():
        sw=SW.read_text(encoding='utf-8')
        sw=re.sub(r"const VERSION = '[^']+';", f"const VERSION = 'atlas-pwa-{content_hash}';", sw)
        sw=re.sub(r"const PACK_VERSION = '[^']+';", f"const PACK_VERSION = 'photos-{photo_hash}';", sw)
        SW.write_text(sw,encoding='utf-8')

    summary={
        'plants':len(plants),
        'photos':sum(len(p['photos']) for p in plants),
        'plants_with_photos':sum(bool(p['photos']) for p in plants),
        'thumbs_created':thumb_created,
        'content_hash':content_hash,
        'photo_hash':photo_hash,
    }
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
