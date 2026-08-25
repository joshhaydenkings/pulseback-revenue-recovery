import { ArrowUpRight, CheckCircle2, Clock3, IndianRupee, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '../components/app-shell';
import { StatusBadge } from '../components/status-badge';
import { formatCurrency } from '../lib/format';

const opportunities = [
  { id: 'RC-1048', customer: 'Aarav Mehta', amount: 42000, failure: 'Authentication', score: 91, expected: 32760, action: 'Merchant approval', status: 'AWAITING_APPROVAL' },
  { id: 'RC-1042', customer: 'Ishita Rao', amount: 9999, failure: 'Bank / network', score: 88, expected: 7199, action: 'Observe 12 min', status: 'PENDING_OBSERVATION' },
  { id: 'RC-1039', customer: 'Neel Kapoor', amount: 4999, failure: 'Authentication', score: 87, expected: 3899, action: 'Payment link', status: 'RECOVERING' },
  { id: 'RC-1037', customer: 'Mira Shah', amount: 2499, failure: 'Insufficient funds', score: 73, expected: 1374, action: 'Wait 2 hours', status: 'SCHEDULED' },
];

const activity = [
  { icon: CheckCircle2, tone: 'green', title: '₹4,999 recovered through Payment Link', time: '2 min ago' },
  { icon: ShieldCheck, tone: 'amber', title: 'Guardian held a ₹42,000 recovery for approval', time: '8 min ago' },
  { icon: Sparkles, tone: 'cyan', title: 'Bank timeout self-recovered during observation', time: '14 min ago' },
];

export default function Home() {
  return (
    <AppShell active="Overview">
      <div className="page-heading">
        <div>
          <p className="eyebrow"><span className="live-dot" /> Live recovery command center</p>
          <h1>Good morning, Aditi.</h1>
          <p>PulseBack is protecting revenue across your Razorpay payment flow.</p>
        </div>
        <div className="date-control"><Clock3 size={15} /> Aug 1 – Aug 25</div>
      </div>

      <section className="hero-metric">
        <div className="hero-copy"><p>Revenue recovered this period</p><h2><span>₹</span>54,299</h2><div className="trend"><ArrowUpRight size={15} /> 18.6% vs last period <span>•</span> 23 payments brought back</div></div>
        <div className="pulse-orbit" aria-hidden="true"><div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="orbit-core"><IndianRupee size={24} /></div></div>
        <div className="hero-side"><span>Recovery efficiency</span><strong>36.4%</strong><small>of eligible revenue</small></div>
      </section>

      <section className="metric-grid">
        {[
          ['Revenue at risk', '₹1,49,180', '+12.4%', '149 detected'], ['Active recoveries', '18', '6 high priority', '₹72,460 in motion'],
          ['Self-recovered', '₹12,498', '5 payments', 'No customer contact'], ['Needs approval', '3', '₹68,499', 'Guardian protected'],
        ].map(([label, value, change, note], index) => (
          <article className="metric-card" key={label}><div className={`metric-icon tone-${index}`}><span>{index === 0 ? '↘' : index === 1 ? '↗' : index === 2 ? '◎' : '!'}</span></div><p>{label}</p><strong>{value}</strong><div><span>{change}</span><small>{note}</small></div></article>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="panel queue-panel">
          <div className="panel-head"><div><h3>Opportunity queue</h3><p>Prioritized by expected recoverable value</p></div><Link href="/recoveries">View all <ArrowUpRight size={14} /></Link></div>
          <div className="queue-table">
            <div className="queue-row queue-header"><span>Customer</span><span>At risk</span><span>Opportunity</span><span>Strategy</span><span>Status</span></div>
            {opportunities.map((item) => (
              <a className="queue-row" href={`/recoveries/${item.id}`} key={item.id}><span><b>{item.customer}</b><small>{item.id} · {item.failure}</small></span><span><b>{formatCurrency(item.amount)}</b><small>{formatCurrency(item.expected)} expected</small></span><span><b className="score"><i style={{ '--score': `${item.score}%` } as React.CSSProperties} />{item.score}</b></span><span>{item.action}</span><span><StatusBadge status={item.status} /></span></a>
            ))}
          </div>
        </section>
        <section className="panel activity-panel">
          <div className="panel-head"><div><h3>Live activity</h3><p>Decisions and outcomes</p></div><span className="live-pill">Live</span></div>
          <div className="activity-list">{activity.map(({ icon: Icon, tone, title, time }) => <div className="activity" key={title}><span className={`activity-icon ${tone}`}><Icon size={16} /></span><div><b>{title}</b><small>{time}</small></div></div>)}</div>
          <div className="safety-note"><ShieldCheck size={17} /><div><b>Guardian is active</b><span>0 guardrail violations this period</span></div></div>
        </section>
      </div>
    </AppShell>
  );
}
