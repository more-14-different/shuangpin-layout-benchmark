"""Exact native 21x26 competition with terminal loads for constrained research.

Routing mirrors the independently verified enumeration kernel; the additional
load counters do not affect any competition or motor-cost decision.
"""
import numba
import numpy as np
from enumerate_toned_2126_v52 import balanced
from enumerate_f19_v52_policies import motor_cost


@numba.njit(nogil=True)
def competition_with_loads(rows,codes,orders,motor,errors):
    n=len(rows);indices=np.zeros((n,6),np.int64);finished=np.zeros(n,np.bool_)
    for i in range(n):
        kind=rows[i,0]
        if kind==0:
            t=rows[i,2];indices[i,0]=codes[t,0];indices[i,1]=codes[t,1]
            indices[i,2]=rows[i,6];indices[i,3]=rows[i,7]
        elif kind==1:
            for j in range(2):
                t=rows[i,2+j];indices[i,j*2]=codes[t,0];indices[i,j*2+1]=codes[t,1]
        else:
            for j in range(kind+1):indices[i,j]=codes[rows[i,2+j],0]
            if kind==2:indices[i,3]=codes[rows[i,4],1]
        if kind:
            indices[i,4]=rows[i,6+orders[kind,0]];indices[i,5]=rows[i,6+orders[kind,1]]
    loads=np.zeros((4,26));transitions=np.zeros((4,2));fingers=np.array([0,3,2,2,2,3,3,6,7,6,7,8,6,6,8,9,0,3,1,3,6,3,1,1,6,0]);totals=np.zeros((4,8));weights=np.zeros(4);counts=np.zeros(4,np.int64)
    next_row=np.empty(n,np.int64);visited=np.empty(n,np.int64);bucket_rows=np.empty(n,np.int64)
    for length in range(2,7):
        keys=np.zeros(1048576,np.int64);heads=np.full(1048576,-1,np.int64);tails=np.empty(1048576,np.int64);nv=0
        for i in range(n):
            kind=rows[i,0];start=2 if kind==0 else (3 if kind==2 else 4)
            if finished[i] or length<start:continue
            packed=1 if kind==0 else 2
            for j in range(length):packed=packed*32+indices[i,j]
            slot=((packed*2654435761)^(packed>>12))&1048575
            while keys[slot]!=0 and keys[slot]!=packed:slot=(slot+1)&1048575
            if keys[slot]==0:
                keys[slot]=packed;heads[slot]=i;visited[nv]=slot;nv+=1
            else:next_row[tails[slot]]=i
            tails[slot]=i;next_row[i]=-1
        for b in range(nv):
            slot=visited[b];i=heads[slot];size=0
            while i>=0:bucket_rows[size]=i;size+=1;i=next_row[i]
            # Character pools are separate and contain no word-length groups.
            word=rows[bucket_rows[0],0]!=0
            ranked=balanced(bucket_rows,size,rows) if word and length>=4 and size>1 else bucket_rows[:size]
            for rank in range(size):
                i=ranked[rank];kind=rows[i,0];last=4 if kind==0 else 6
                if rank>0 and length<last:continue
                finished[i]=True;weight=rows[i,1];aux=max(0,length-(2 if kind==0 else 4))
                totals[kind,0]+=weight*motor_cost(indices[i],length,motor,errors)
                totals[kind,1]+=weight*(aux>=1);totals[kind,2]+=weight*(aux>=2)
                totals[kind,4]+=weight*(rank>0);totals[kind,5]+=weight*rank
                totals[kind,6]+=weight*(rank//6);totals[kind,7]+=weight*length
                weights[kind]+=weight;counts[kind]+=1
                transitions[kind,0]+=weight*(length-1)
                for j in range(length):loads[kind,indices[i,j]]+=weight
                for j in range(1,length):
                    if indices[i,j-1]!=indices[i,j] and fingers[indices[i,j-1]]==fingers[indices[i,j]]:transitions[kind,1]+=weight
    return totals,weights,counts,loads,transitions
