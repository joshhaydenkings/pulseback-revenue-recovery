import Link from 'next/link';
import { ArrowUpRight, CheckCircle2, Clock3, IndianRupee, ShieldCheck, Sparkles } from 'lucide-react';
import { AppShell } from '../components/app-shell';
import { DashboardCharts } from '../components/charts/dashboard-charts';
import { StatusBadge } from '../components/status-badge';
import { formatCurrency } from '../lib/format';
import { getRecoveryRepository } from '../repositories/recovery-repository';

export default async function Home() {
  const dashboard = await getRecoveryRepository().getDashboard();
  return <AppShell active="Overview">
    <div className="page-heading"><div><p className="eyebrow"><span className="live-dot"/> Live recovery command center</p><h1>Good morning, Aditi.</h1><p>PulseBack is protecting revenue across your payment recovery flow.</p></div><div className="date-control"><Clock3 size={15}/> Persistent history</div></div>
    <section className="hero-metric"><div className="hero-copy"><p>Revenue recovered this period</p><h2><span>₹</span>{Math.round(dashboard.revenueRecoveredPaise/100).toLocaleString('en-IN')}</h2><div className="trend"><ArrowUpRight size={15}/>{dashboard.recoveredCount} payments brought back <span>•</span> Server calculated</div></div><div className="pulse-orbit" aria-hidden="true"><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="orbit-core"><IndianRupee size={24}/></div></div><div className="hero-side"><span>Recovery efficiency</span><strong>{(dashboard.recoveryRate*100).toFixed(1)}%</strong><small>of detected revenue</small></div></section>
    <section className="metric-grid">{[
      ['Revenue at risk',formatCurrency(dashboard.revenueAtRiskPaise/100),'Live total','stored cases'],
      ['Active recoveries',String(dashboard.activeRecoveries),'Server state',formatCurrency(dashboard.expectedRecoveryPaise/100)+' expected'],
      ['Self-recovered',formatCurrency(dashboard.selfRecoveredPaise/100),`${dashboard.selfRecoveredCount} payments`,'No customer contact'],
      ['Needs approval',String(dashboard.needsApproval),formatCurrency(dashboard.needsApprovalPaise/100),'Guardian protected'],
    ].map(([label,value,change,note],index)=><article className="metric-card" key={label}><div className={`metric-icon tone-${index}`}><span>{index===0?'↘':index===1?'↗':index===2?'◎':'!'}</span></div><p>{label}</p><strong>{value}</strong><div><span>{change}</span><small>{note}</small></div></article>)}</section>
    <DashboardCharts pulse={dashboard.pulse} effectiveness={dashboard.effectiveness}/>
    <div className="dashboard-grid"><section className="panel queue-panel"><div className="panel-head"><div><h3>Opportunity queue</h3><p>Prioritized by expected recoverable value</p></div><Link href="/recoveries">View all <ArrowUpRight size={14}/></Link></div><div className="queue-table"><div className="queue-row queue-header"><span>Customer</span><span>At risk</span><span>Opportunity</span><span>Strategy</span><span>Status</span></div>{dashboard.opportunityQueue.map(item=><a className="queue-row" href={`/recoveries/${item.id}`} key={item.id}><span><b>{item.customerName}</b><small>{item.id} · {item.failureCategory.replaceAll('_',' ')}</small></span><span><b>{formatCurrency(item.amountPaise/100)}</b><small>{formatCurrency(item.expectedRecoverableValuePaise/100)} expected</small></span><span><b className="score"><i style={{'--score':`${item.opportunityScore}%`} as React.CSSProperties}/>{item.opportunityScore}</b></span><span>{item.currentStrategy.replaceAll('_',' ')}</span><span><StatusBadge status={item.status}/></span></a>)}</div></section>
      <section className="panel activity-panel"><div className="panel-head"><div><h3>Live activity</h3><p>Persistent decisions and outcomes</p></div><span className="live-pill">Live</span></div><div className="activity-list">{dashboard.recentActivity.slice(0,3).map((event,index)=>{const Icon=index===0?CheckCircle2:index===1?ShieldCheck:Sparkles;return <div className="activity" key={event.id}><span className={`activity-icon ${index===0?'green':index===1?'amber':'cyan'}`}><Icon size={16}/></span><div><b>{event.message}</b><small>{new Date(event.timestamp).toLocaleString('en-IN')}</small></div></div>})}</div><div className="safety-note"><ShieldCheck size={17}/><div><b>Guardian is active</b><span>Every mutation is audited server-side</span></div></div></section>
    </div>
  </AppShell>;
}
