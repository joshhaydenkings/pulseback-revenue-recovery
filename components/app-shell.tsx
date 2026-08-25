'use client';

import { Activity, Beaker, BookOpenCheck, ChevronDown, CircleDollarSign, FlaskConical, Gauge, Menu, PlugZap, Search, Settings, ShieldCheck, TerminalSquare, X } from 'lucide-react';
import { useState } from 'react';

const nav = [
  ['Overview', '/', Gauge], ['Recovery Queue', '/recoveries', CircleDollarSign], ['Leak Map', '/leaks', Activity], ['Recovery Lab', '/lab', FlaskConical],
  ['Policies', '/policies', ShieldCheck], ['Audit Trail', '/audit', BookOpenCheck], ['Integrations', '/integrations', PlugZap],
] as const;

export function AppShell({ children, active }: { children: React.ReactNode; active: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <div className="app-frame">
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="brand"><span className="brand-mark"><i /><i /><i /></span><div><b>PulseBack</b><small>Revenue Autopilot</small></div><button aria-label="Close menu" className="mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <div className="mode-card"><span>Operating mode</span><button><i /> AUTOPILOT <ChevronDown size={13} /></button><small>Guardian protected</small></div>
      <nav>{nav.map(([label, href, Icon]) => <a href={href} className={active === label ? 'active' : ''} key={label}><Icon size={18} /><span>{label}</span>{label === 'Recovery Queue' && <em>18</em>}</a>)}</nav>
      <div className="sidebar-bottom"><a href="/demo"><TerminalSquare size={18} />Demo Console<span>⌘D</span></a><a href="/settings"><Settings size={18} />Settings</a><div className="connection"><span><i className="ok" /> Razorpay <b>Demo</b></span><span><i className="warn" /> AI <b>Rules fallback</b></span></div></div>
    </aside>
    {mobileOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
    <div className="main-shell">
      <header className="topbar"><button aria-label="Open menu" className="menu-button" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="top-search"><Search size={16} /><span>Search case, customer, payment...</span><kbd>⌘ K</kbd></div><div className="top-actions"><span className="demo-badge">SIMULATED DATA</span><button aria-label="Demo tools" className="icon-button"><Beaker size={17} /></button><div className="avatar">AM</div></div></header>
      <main className="content">{children}</main>
    </div>
  </div>;
}
