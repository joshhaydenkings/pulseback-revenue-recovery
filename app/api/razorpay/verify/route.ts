import { z } from 'zod';
import { verifyCheckoutSignature } from '../../../../lib/razorpay/signature';
const schema=z.object({orderId:z.string(),paymentId:z.string(),signature:z.string()});
export async function POST(request:Request){try{const x=schema.parse(await request.json());const secret=process.env.RAZORPAY_KEY_SECRET;if(!secret)return Response.json({error:'Razorpay Test Mode is not configured'},{status:503});return Response.json({verified:verifyCheckoutSignature(x.orderId,x.paymentId,x.signature,secret)});}catch{return Response.json({error:'Invalid verification payload'},{status:400});}}
