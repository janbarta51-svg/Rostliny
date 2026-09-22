#!/usr/bin/env python3
from __future__ import annotations
import argparse, io, json, os, re, shutil, sys, time, zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from PIL import Image, ImageOps

DEFAULT_MASTER = Path('/mnt/data/atlas_work/data/plants.json')
DEFAULT_DOCX = Path('/mnt/data/atlas_work/seznam_rostlin_master.docx')


def slug_name(plant_id: str, idx: int) -> str:
    return f"{plant_id}-{idx:02d}.webp"


def optimize_one(args):
    source_bytes, out_full, out_thumb = args
    with Image.open(io.BytesIO(source_bytes)) as im:
        im = ImageOps.exif_transpose(im)
        # Convert palette/CMYK modes cleanly. Preserve real alpha if present.
        if im.mode in ('RGBA', 'LA'):
            work = im.convert('RGBA')
        else:
            work = im.convert('RGB')
        original = work.size
        full = work.copy()
        full.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        out_full.parent.mkdir(parents=True, exist_ok=True)
        full.save(out_full, 'WEBP', quality=82, method=4)
        thumb = work.copy()
        thumb.thumbnail((420, 320), Image.Resampling.LANCZOS)
        out_thumb.parent.mkdir(parents=True, exist_ok=True)
        thumb.save(out_thumb, 'WEBP', quality=76, method=4)
        return original, full.size, out_full.stat().st_size, out_thumb.stat().st_size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--master', type=Path, default=DEFAULT_MASTER)
    ap.add_argument('--docx', type=Path, default=DEFAULT_DOCX)
    ap.add_argument('--dist', type=Path, default=Path(__file__).resolve().parents[1]/'dist')
    ap.add_argument('--report', type=Path, default=Path(__file__).resolve().parents[1]/'reports/build_web.json')
    args = ap.parse_args()

    plants = json.loads(args.master.read_text(encoding='utf-8'))
    out_images = args.dist/'images'
    out_thumbs = out_images/'thumbs'
    out_data = args.dist/'data'
    out_images.mkdir(parents=True, exist_ok=True)
    out_thumbs.mkdir(parents=True, exist_ok=True)
    out_data.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(args.docx) as zf:
        media = {n: zf.read(n) for n in zf.namelist() if n.startswith('word/media/') and not n.endswith('/')}

    tasks=[]
    prod=[]
    missing=[]
    source_total=0
    source_sizes={}
    for source_name, b in media.items():
        source_sizes[source_name]=len(b); source_total += len(b)

    for p in plants:
        q = dict(p)
        new_photos=[]
        for i, src in enumerate(p.get('photos', []), 1):
            if src not in media:
                missing.append({'id':p['id'],'photo':src})
                continue
            name=slug_name(p['id'], i)
            full_rel=f"images/{name}"
            thumb_rel=f"images/thumbs/{name}"
            out_full=args.dist/full_rel; out_thumb=args.dist/thumb_rel
            if not (out_full.is_file() and out_thumb.is_file()):
                tasks.append((media[src], out_full, out_thumb))
            new_photos.append(full_rel)
        q['photos']=new_photos
        prod.append(q)

    if missing:
        raise SystemExit(f"Chybí {len(missing)} zdrojových fotek: {missing[:5]}")

    t0=time.time(); stats=[]
    workers=max(2, min(8, (os.cpu_count() or 4)))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures=[ex.submit(optimize_one,t) for t in tasks]
        for n,f in enumerate(as_completed(futures),1):
            stats.append(f.result())
            if n % 100 == 0:
                print(f"Optimalizováno {n}/{len(tasks)}", flush=True)

    # Runtime data source. This is the only botanical data file consumed by the web app.
    (out_data/'plants.json').write_text(json.dumps(prod, ensure_ascii=False, separators=(',',':'))+'\n', encoding='utf-8')

    full_total=sum(p.stat().st_size for p in out_images.glob('*.webp'))
    thumb_total=sum(p.stat().st_size for p in out_thumbs.glob('*.webp'))
    report={
        'plants':len(prod),
        'plants_with_photos':sum(bool(p['photos']) for p in prod),
        'photos':sum(len(p.get('photos', [])) for p in prod),
        'optimized_this_run':len(tasks),
        'source_media_bytes':source_total,
        'optimized_full_bytes':full_total,
        'optimized_thumb_bytes':thumb_total,
        'optimized_total_bytes':full_total+thumb_total,
        'source_to_optimized_ratio': round((full_total+thumb_total)/source_total,4) if source_total else None,
        'max_full_px':1600,
        'max_thumb_px':[420,320],
        'webp_quality_full':82,
        'webp_quality_thumb':76,
        'seconds':round(time.time()-t0,2),
        'missing_source_photos':missing,
    }
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
