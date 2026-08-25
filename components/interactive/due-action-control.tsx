'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export function DueActionControl(){const router=useRouter();const[pending,setPending]=useState(false);const[notice,setNotice]=useState('');const run=async()=>{setPending(true);const response=await fetch('/api/cron/recovery',{method:'POST'});const result=await response.json() as {processed?:number;succeeded?:number;failed?:number;skipped?:number;error?:string};setNotice(response.ok?`${result.processed??0} processed · ${result.succeeded??0} succeeded · ${result.failed??0} failed · ${result.skipped??0} skipped`:result.error??'Unable to process actions');setPending(false);router.refresh()};return <div className="due-action-control"><button className="secondary-button" onClick={run} disabled={pending}>{pending&&<Loader2 className="spin" size={13}/>}Process now</button>{notice&&<small>{notice}</small>}</div>}
