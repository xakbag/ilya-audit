import csv,json
reg=list(csv.DictReader(open('registry.csv',encoding='utf-8-sig'),delimiter=';'))
uz={}
for x in csv.reader(open('backup/sheets/Переводы uz.csv',encoding='utf-8-sig'),delimiter=';'):
    if x[1].startswith('D2-') and x[2] in('zone','work','materials'): uz.setdefault(x[1],{})[x[2]]=x[4]
ovr={}
out=[]
for r in reg:
    t=dict(r); o=ovr.get(t['task_id'])
    t['pending']=bool(o)
    if o: t.update(o)
    t['uz']=uz.get(t['task_id'],{})
    out.append(t)
open('site/data.js','w',encoding='utf-8').write('window.TASKS='+json.dumps(out,ensure_ascii=False)+';')
print(len(out),sum(1 for t in out if t['uz']))
