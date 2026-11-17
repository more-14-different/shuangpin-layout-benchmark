"""Lossless shared row metadata for the local offline R11 artifact."""
def natives(data):
    s=data.get('tonedContractBenchmark',{}).get('schemes',{})
    return [n for n in [s.get('snowJiandao'),*s.get('research',{}).values()] if n]

def restore(data):
    pool=data.get('tonedFilterRowPool')
    if not pool:return data
    if pool['version']!=1:raise ValueError('unknown filter pool')
    for n in natives(data):
        packed=n.get('filterRowsPacked')
        if not packed:continue
        if packed['version']!=1 or 'filterRows' in n:raise ValueError('invalid filter encoding')
        n['filterRows']=[[pool['rows'][i][0],pool['rows'][i][1],main,terminal,pool['rows'][i][2],pool['rows'][i][3]] for i,main,terminal in packed['rows']]
        del n['filterRowsPacked']
    del data['tonedFilterRowPool']
    return data

def compact(data):
    restore(data)
    pool=[];indices={};count=0
    for n in natives(data):
        if 'filterRows' not in n:continue
        rows=n.pop('filterRows');packed=[]
        for text,reading,main,terminal,weight,kind in rows:
            descriptor=(text,reading,weight,kind)
            index=indices.get(descriptor)
            if index is None:index=len(pool);indices[descriptor]=index;pool.append(list(descriptor))
            packed.append([index,main,terminal]);count+=1
        n['filterRowsPacked']={'version':1,'rows':packed}
    data['tonedFilterRowPool']={'version':1,'rows':pool}
    return dict(rows=count,sharedDescriptors=len(pool))
