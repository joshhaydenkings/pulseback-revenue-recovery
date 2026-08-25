import { createHmac, timingSafeEqual } from 'node:crypto';
export function verifyRazorpaySignature(body:string, signature:string, secret:string){if(!signature||!secret)return false;const expected=createHmac('sha256',secret).update(body).digest('hex');const a=Buffer.from(expected);const b=Buffer.from(signature);return a.length===b.length&&timingSafeEqual(a,b);}
export function verifyCheckoutSignature(orderId:string,paymentId:string,signature:string,secret:string){return verifyRazorpaySignature(`${orderId}|${paymentId}`,signature,secret);}
