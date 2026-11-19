"""Add explicit cross-basin onset controls to the bounded 1f9 search finalists."""
import copy
import itertools
import json
from pathlib import Path

from search_1f9_remove_p import ROOT,PREFIX,read,POLICY
from search_cr_667_zero_carriers import CarrierSpace
from prepare_cr_m24_portfolio import make_layout


def main():
    filename=Path(str(PREFIX)+'-candidates.json');bundle=read(filename)
    source=read(ROOT/'research/notes/2026-11-19-lan213-v52-followup-candidates.json')
    space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
    base=next(r for r in source['layouts'] if r['id']=='1f9e267cd2')['state']
    f19=next(r for r in source['layouts'] if r['id']=='f19a0ad1dc')['state']
    names={a['name']:i for i,a in enumerate(space.f['atoms'])}
    existing={r['key'] for r in bundle['layouts'] if 'key'in r};count=0
    for keys in itertools.permutations('KSL'):
        state=copy.deepcopy(base);state['firstKeys']=copy.deepcopy(f19['firstKeys'])
        for name in 'AEO':state['firstKeys'][names['zero-'+name]]='R'
        for name,key in zip(['zh','ch','sh'],keys):state['firstKeys'][names[name]]=key
        memory=space.memory(state)
        if memory['m']>22 or memory['guard']>24 or memory['d']>2:raise ValueError('cross-basin control exceeds budget')
        key=space.key(state)
        if key in existing:continue
        layout=make_layout(space,state,dict(ckt=0),bundle['tokenKeys'],key[:10]);layout.pop('rustScore')
        layout.update(wordAuxiliaryPolicy=POLICY,searchLabel='f19-like k/l displacements; unified AEO; retroflex '+','.join(keys))
        bundle['layouts'].append(layout);existing.add(key);count+=1
    # Existing no-P competitors from the previous 72-layout audit also satisfy
    # this task. Include its three default-cost leaders within +0.01 CKT of 1f9.
    archive_controls=[]
    for ident in ['17983edeb8','4dd984b9ea','906cbfe3cf']:
        layout=copy.deepcopy(next(r for r in source['layouts'] if r['id']==ident))
        memory=space.memory(layout['state'])
        if memory['m']>22 or memory['guard']>24 or memory['d']>2:raise ValueError('archive control exceeds budget')
        if any(layout['firstKeys'][n]=='P' for n in ['zh','ch','sh']):raise ValueError('archive control retains a retroflex on P')
        archive_controls.append(ident)
        if layout['key'] in existing:continue
        layout['searchLabel']='existing compatible no-P candidate from prior v5.2 audit'
        bundle['layouts'].append(layout);existing.add(layout['key']);count+=1
    bundle['auditAllLayouts']=True
    bundle['additionalOnsetControls']=6
    bundle['archivedNoPControls']=archive_controls
    filename.write_text(json.dumps(bundle,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('additional onset controls',count,'layouts',len(bundle['layouts']),flush=True)


if __name__=='__main__':main()
