"""Rebuild the offline-friendly data.js from one JSON file per plant (Python 3, no dependencies)."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parent
families=json.loads((root/'content/families.json').read_text(encoding='utf-8'))
groups=json.loads((root/'content/groups.json').read_text(encoding='utf-8'))
plants=[]
for file in sorted((root/'content/plants').glob('*.json')):
 p=json.loads(file.read_text(encoding='utf-8'));p['id']=file.stem
 if not p.get('czech') or not p.get('latin'):raise ValueError('Chybí název: '+file.name)
 family=next((f for f in families if f['latin']==p['family']),None)
 if not family:raise ValueError('Neznámá čeleď: '+file.name)
 p['family_czech']=family['czech'];p['group']=family['group'];p['genus']=p['latin'].split()[0]
 for k in ['aliases','colors','months','images','sources']:p[k]=p.get(k) or []
 p['months']=[int(m) for m in p['months']]
 if any(m<1 or m>12 for m in p['months']):raise ValueError('Neplatný měsíc: '+file.name)
 for k in ['notes','color_detail','flowering_detail','trait_source']:p[k]=p.get(k) or ''
 if not p['color_detail']:p['color_detail']=', '.join(p['colors'])
 if not p['flowering_detail'] and p['months']:p['flowering_detail']=', '.join(str(m) for m in p['months'])
 p['rank']=p.get('rank') or 'druh';p['nonflowering']=p['group']==groups[0]
 for im in p['images']:
  im['path']=im['path'].removeprefix('/')
  if im['path'].startswith('dist/'):im['path']=im['path'][5:]
  if not im['path'].startswith('images/') or '..' in im['path']:raise ValueError('Neplatná cesta obrázku: '+file.name)
  if not (root/'dist'/im['path']).is_file():raise ValueError('Chybí obrázek: '+im['path'])
  if not im.get('thumb') or not (root/'dist'/im['thumb']).is_file():im['thumb']=im['path']
 plants.append(p)
plants.sort(key=lambda p:(groups.index(p['group']),p['family_czech'].lower(),p['genus'],p['latin']))
data={'plants':plants,'families':families,'groups':groups,'images':sum(len(p['images']) for p in plants)}
(root/'dist/data.js').write_text('window.ATLAS = '+json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')+';\n',encoding='utf-8')
print(str(len(plants))+' položek, '+str(data['images'])+' fotografií. Hotovo: dist/data.js')
