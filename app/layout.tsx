import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './product.css';
import './demo.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
export const metadata: Metadata = { metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL??'http://localhost:3000'), title: 'PulseBack — AI Revenue Recovery Autopilot', description: 'Detect, understand and safely recover failed payments with explainable AI and deterministic financial guardrails.', openGraph:{title:'PulseBack',description:'Failed doesn’t mean lost.',images:[{url:'/og.png',width:1536,height:1024,alt:'PulseBack — Failed doesn’t mean lost.'}]},twitter:{card:'summary_large_image',title:'PulseBack',description:'Failed doesn’t mean lost.',images:['/og.png']} };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>; }
