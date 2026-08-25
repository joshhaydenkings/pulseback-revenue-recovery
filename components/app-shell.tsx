'use client';

import { Activity, Beaker, BookOpenCheck, ChevronDown, CircleDollarSign, FlaskConical, Gauge, Menu, PlugZap, Search, Settings, ShieldCheck, TerminalSquare, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GuardianPolicies, OperatingMode } from '../domain/recovery/types';

const nav = [
  ['Overview', '/', Gauge], ['Recovery Queue', '/recoveries', CircleDollarSign], ['Leak Map', '/leaks', Activity], ['Recovery Lab', '/lab', FlaskConical],
  ['Policies', '/policies', ShieldCheck], ['Audit Trail', '/audit', BookOpenCheck], ['Integrations', '/integrations', PlugZap],
] as const;

export function AppShell({ children, active }: { children: React.ReactNode; active: string }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [policies, setPolicies] = useState<(GuardianPolicies & {storage?:string})>();
  const [activeCount, setActiveCount] = useState(18);
  useEffect(()=>{void Promise.all([fetch('/api/policies').then(r=>r.json()),fetch('/api/dashboard').then(r=>r.json())]).then(([policy,dashboard])=>{setPolicies(policy as GuardianPolicies & {storage?:string});setActiveCount(Number((dashboard as {activeRecoveries?:number}).activeRecoveries??18))}).catch(()=>undefined)},[]);
  const changeMode=async(mode:OperatingMode)=>{if(!policies||mode===policies.operatingMode)return;if(mode==='AUTOPILOT'&&!window.confirm('Enable bounded autonomous recovery? Guardian limits will still apply.'))return;const next={...policies,operatingMode:mode};delete next.storage;const response=await fetch('/api/policies',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(next)});if(response.ok){setPolicies({...next,storage:policies.storage});setModeOpen(false);router.refresh()}};
  return <div className="app-frame">
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="brand"><span className="brand-mark"><i /><i /><i /></span><div><b>PulseBack</b><small>Revenue Autopilot</small></div><button aria-label="Close menu" className="mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <div className="mode-card"><span>Operating mode</span><button aria-expanded={modeOpen} onClick={()=>setModeOpen(!modeOpen)}><i /> {policies?.operatingMode??'AUTOPILOT'} <ChevronDown size={13} /></button>{modeOpen&&<div className="mode-menu">{(['SHADOW','APPROVAL','AUTOPILOT'] as const).map(mode=><button key={mode} onClick={()=>changeMode(mode)}>{mode}</button>)}</div>}<small>{policies?.storage==='postgresql'?'PostgreSQL · Guardian protected':'Demo fallback · Guardian protected'}</small></div>
      <nav>{nav.map(([label, href, Icon]) => <a href={href} className={active === label ? 'active' : ''} key={label}><Icon size={18} /><span>{label}</span>{label === 'Recovery Queue' && <em>{activeCount}</em>}</a>)}</nav>
      <div className="sidebar-bottom"><a href="/demo"><TerminalSquare size={18} />Demo Console<span>⌘D</span></a><a href="/settings"><Settings size={18} />Settings</a><div className="connection"><span><i className="ok" /> Razorpay <b>Demo</b></span><span><i className="warn" /> AI <b>Rules fallback</b></span></div></div>
    </aside>
    {mobileOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
    <div className="main-shell">
      <header className="topbar"><button aria-label="Open menu" className="menu-button" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="top-search"><Search size={16} /><span>Search case, customer, payment...</span><kbd>⌘ K</kbd></div><div className="top-actions"><span className="demo-badge">SIMULATED DATA</span><button aria-label="Demo tools" className="icon-button"><Beaker size={17} /></button><div className="avatar">AM</div></div></header>
      <main className="content">{children}</main>
    </div>
  </div>;
}
