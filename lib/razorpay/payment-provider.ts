export interface PaymentLink { id:string; shortUrl:string; status:'created'|'paid'|'cancelled'|'expired'; amountPaise:number; }
export interface PaymentProvider { createOrder(input:{amountPaise:number;receipt:string}):Promise<{id:string;amount:number;currency:string}>; getPayment(id:string):Promise<{id:string;status:string}>; createPaymentLink(input:{amountPaise:number;referenceId:string;customer:{name:string;email:string}}):Promise<PaymentLink>; cancelPaymentLink?(id:string):Promise<void>; }

export class MockPaymentProvider implements PaymentProvider {
  private links = new Map<string,PaymentLink>();
  constructor(private injectFailure=false) {}
  async createOrder(input:{amountPaise:number;receipt:string}) { return {id:`order_demo_${input.receipt}`,amount:input.amountPaise,currency:'INR'}; }
  async getPayment(id:string) { return {id,status:'failed'}; }
  async createPaymentLink(input:{amountPaise:number;referenceId:string;customer:{name:string;email:string}}) { if (this.injectFailure) throw new Error('SIMULATED_PROVIDER_UNAVAILABLE'); const existing=this.links.get(input.referenceId); if(existing)return existing; const link={id:`plink_demo_${input.referenceId}`,shortUrl:`https://rzp.io/i/demo-${input.referenceId}`,status:'created' as const,amountPaise:input.amountPaise};this.links.set(input.referenceId,link);return link; }
  async cancelPaymentLink(id:string) { for(const [key,link] of this.links)if(link.id===id)this.links.set(key,{...link,status:'cancelled'}); }
}

export class RazorpayPaymentProvider implements PaymentProvider {
  private auth=Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  private async call<T=unknown>(path:string,init?:RequestInit):Promise<T>{const res=await fetch(`https://api.razorpay.com/v1${path}`,{...init,headers:{Authorization:`Basic ${this.auth}`,'Content-Type':'application/json',...init?.headers}});if(!res.ok)throw new Error(`Razorpay request failed (${res.status})`);return res.json() as Promise<T>;}
  createOrder(input:{amountPaise:number;receipt:string}){return this.call<{id:string;amount:number;currency:string}>('/orders',{method:'POST',body:JSON.stringify({amount:input.amountPaise,currency:'INR',receipt:input.receipt})});}
  getPayment(id:string){return this.call<{id:string;status:string}>(`/payments/${encodeURIComponent(id)}`);}
  createPaymentLink(input:{amountPaise:number;referenceId:string;customer:{name:string;email:string}}){return this.call<{id:string;short_url:string;status:PaymentLink['status'];amount:number}>('/payment_links',{method:'POST',body:JSON.stringify({amount:input.amountPaise,currency:'INR',reference_id:input.referenceId,customer:input.customer,description:'PulseBack recovery payment'})}).then(x=>({id:x.id,shortUrl:x.short_url,status:x.status,amountPaise:x.amount}));}
  async cancelPaymentLink(id:string){await this.call(`/payment_links/${encodeURIComponent(id)}/cancel`,{method:'POST'});}
}
