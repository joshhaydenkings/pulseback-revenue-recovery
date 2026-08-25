import { z } from 'zod';
import { MockPaymentProvider, RazorpayPaymentProvider } from '../../../../lib/razorpay/payment-provider';
const schema=z.object({amountPaise:z.number().int().min(100).max(5_000_000)});
export async function POST(request:Request){try{const input=schema.parse(await request.json());const configured=Boolean(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET);const provider=configured?new RazorpayPaymentProvider():new MockPaymentProvider();const order=await provider.createOrder({amountPaise:input.amountPaise,receipt:`pulseback_${Date.now()}`});return Response.json({...order,keyId:configured?process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID:null,simulated:!configured});}catch{return Response.json({error:'Unable to create Test Mode order'},{status:400});}}
