import type { FailureCategory, RecoveryCase, RecoveryStatus, TimelineEvent } from '../domain/recovery/types';

const tl=(id:string,minutes:number,actor:TimelineEvent['actor'],title:string,kind:TimelineEvent['kind']='neutral',description?:string):TimelineEvent=>({id:`${id}-${minutes}-${title}`,time:new Date(Date.UTC(2026,7,25,4,32+minutes)).toISOString(),actor,title,kind,description});
const definitions: Array<[string,string,number,FailureCategory,RecoveryStatus,number,number,string,string]> = [
  ['RC-1048','Aarav Mehta',42000,'AUTHENTICATION','AWAITING_APPROVAL',91,.78,'REQUEST_MERCHANT_APPROVAL','Card •••• 7842'],
  ['RC-1042','Ishita Rao',9999,'BANK_NETWORK','PENDING_OBSERVATION',88,.72,'OBSERVE','UPI'],
  ['RC-1039','Neel Kapoor',4999,'AUTHENTICATION','RECOVERING',87,.78,'CREATE_PAYMENT_LINK','Card •••• 4408'],
  ['RC-1037','Mira Shah',2499,'INSUFFICIENT_FUNDS','SCHEDULED',73,.55,'WAIT','UPI'],
  ['RC-1034','Rohan Das',1499,'CUSTOMER_ABANDONMENT','PLAN_READY',68,.63,'SEND_EMAIL_REMINDER','Netbanking'],
  ['RC-1029','Tara Iyer',24999,'SUBSCRIPTION_FAILURE','ESCALATED',61,.46,'ESCALATE','Card •••• 1260'],
  ['RC-1024','Kabir Jain',899,'BANK_NETWORK','SELF_RECOVERED',58,.70,'OBSERVE','UPI'],
  ['RC-1018','Naina Batra',499,'CUSTOMER_ABANDONMENT','STOPPED',22,.18,'STOP','Wallet'],
  ['RC-1012','Dev Malhotra',9999,'AUTHENTICATION','RECOVERED',84,.76,'CREATE_PAYMENT_LINK','Card •••• 9032'],
];

const descriptions:Record<FailureCategory,string>={AUTHENTICATION:'Payment authentication was not completed by the issuing bank',INSUFFICIENT_FUNDS:'Issuer declined because the account balance was insufficient',BANK_NETWORK:'Bank gateway timed out before returning a final status',CUSTOMER_ABANDONMENT:'Customer left checkout before authorization completed',SUBSCRIPTION_FAILURE:'Recurring mandate could not be charged',UNKNOWN:'Provider returned an unclassified failure'};
const actions:Record<string,RecoveryCase['decision']['recommendedAction']>={REQUEST_MERCHANT_APPROVAL:'CREATE_PAYMENT_LINK',CREATE_PAYMENT_LINK:'CREATE_PAYMENT_LINK',OBSERVE:'OBSERVE',WAIT:'WAIT',SEND_EMAIL_REMINDER:'SEND_REMINDER',ESCALATE:'ESCALATE',STOP:'STOP'};

export const demoCases: RecoveryCase[] = definitions.map(([id,name,amount,category,status,score,prob,strategy,method],index)=>{
  const high=amount>25000; const stopped=status==='STOPPED'; const recovered=status==='RECOVERED'; const self=status==='SELF_RECOVERED';
  const memory={successfulPayments:Math.max(0,5-index%4),failedPayments:1+index%3,recoveryAttempts:status==='ESCALATED'?2:status==='STOPPED'?3:index%2,contacts24h:stopped?2:index%2,contacts7d:stopped?5:1+index%3,previousRecoveries:index%3,fatigueScore:stopped?92:18+index*6,preferredMethod:method};
  const timeline=[tl(id,0,'RAZORPAY','Payment failed','danger',descriptions[category]),tl(id,1,'SYSTEM','Revenue at risk detected','neutral',`${id} entered the recovery state machine`),tl(id,2,'PULSEBACK_AI','Payment Autopsy completed','ai',`${category.replaceAll('_',' ').toLowerCase()} classified with ${Math.round(prob*100)}% estimated recovery probability`),tl(id,3,'GUARDIAN',high?'Merchant approval required':'Recovery plan authorized',high?'warning':'success',high?'Amount exceeds the ₹25,000 autonomous threshold':'All deterministic safety policies passed')];
  if(self)timeline.push(tl(id,8,'RAZORPAY','Payment authorized during observation','success','Pending recovery was cancelled before any customer contact'));
  if(recovered)timeline.push(tl(id,5,'SYSTEM','Payment Link created','neutral','Simulated Test Mode link delivered'),tl(id,13,'CUSTOMER','₹9,999 recovered','success','Razorpay payment_link.paid matched to the original case'));
  if(status==='RECOVERING')timeline.push(tl(id,5,'SYSTEM','Payment Link created','neutral','A single active recovery link was created safely'));
  if(status==='ESCALATED')timeline.push(tl(id,5,'SYSTEM','Provider action failed safely','danger','No duplicate link was created. Case moved to merchant review.'));
  if(stopped)timeline.push(tl(id,4,'GUARDIAN','Recovery stopped','warning','Customer contact fatigue exceeded the configured threshold'));
  return {id,paymentId:`pay_demo_${id.slice(3)}`,customerId:`cust_${index+1}`,customerName:name,customerEmail:`${name.toLowerCase().replace(' ','.')}@example.com`,amountPaise:amount*100,currency:'INR',paymentMethod:method,status,failureCategory:category,failureDescription:descriptions[category],opportunityScore:score,predictedRecoveryProbability:prob,expectedRecoverableValuePaise:Math.round(amount*100*prob*(stopped?.35:1)),currentStrategy:strategy as RecoveryCase['currentStrategy'],attempts:memory.recoveryAttempts,recoveredAmountPaise:recovered?amount*100:self?amount*100:0,riskFlags:high?[]:[],createdAt:new Date(Date.UTC(2026,7,25,4,32-index*53)).toISOString(),nextActionAt:status==='SCHEDULED'?new Date(Date.UTC(2026,7,25,7,0)).toISOString():undefined,activePaymentLinkId:status==='RECOVERING'?'plink_demo_1039':undefined,operatingMode:'AUTOPILOT',memory,decision:{diagnosis:descriptions[category],failureCategory:category,recommendedAction:actions[strategy],confidence:category==='UNKNOWN'?.48:.88,estimatedRecoveryProbability:prob,merchantExplanation:stopped?'Another reminder would exceed the recovery-contact boundary. PulseBack stopped to protect the customer relationship.':category==='AUTHENTICATION'?'This transaction is recoverable because authentication failed before authorization. The customer has a positive payment history and remains below contact limits.':category==='BANK_NETWORK'?'The bank did not return a final state. PulseBack will observe first to avoid contacting a customer whose payment may authorize late.':'Customer history and failure evidence support a measured recovery attempt within the configured limits.',supportingEvidence:[`${memory.successfulPayments} previous successful payments`,`${memory.contacts24h} recovery contacts in 24 hours`,`Attempt ${memory.recoveryAttempts+1} of 3`],waitMinutes:strategy==='WAIT'?120:strategy==='OBSERVE'?12:undefined,riskFlags:[]},guardianDecision:high?'APPROVAL_REQUIRED':stopped?'BLOCKED':'APPROVED',guardianReasons:high?['Transaction exceeds ₹25,000 autonomous threshold','High-value action requires merchant review']:stopped?['Customer recovery fatigue exceeds threshold','7-day contact limit reached']:['Amount below threshold','Contact limit not exceeded','No high-risk flags','Attempt limit available','No duplicate active Payment Link'],timeline};
});

export const getDemoCase=(id:string)=>demoCases.find(c=>c.id===id)??demoCases[2];

export const auditEvents = demoCases.flatMap(c=>c.timeline.map(e=>({id:e.id,timestamp:e.time,actor:e.actor,caseId:c.id,event:e.title,outcome:e.kind==='danger'?'Needs review':e.kind==='success'?'Completed':'Recorded',message:e.description??e.title,metadata:{paymentId:c.paymentId,amountPaise:c.amountPaise,status:c.status}}))).sort((a,b)=>b.timestamp.localeCompare(a.timestamp));

export const leakData=[
  {category:'Authentication',risk:78497,recovered:32199,rate:41,strategy:'Payment Link'}, {category:'Bank / Network',risk:42390,recovered:18440,rate:44,strategy:'Observe → Link'},
  {category:'Insufficient Funds',risk:28994,recovered:8100,rate:28,strategy:'Wait + Reminder'}, {category:'Checkout Abandonment',risk:18290,recovered:4760,rate:26,strategy:'Reminder'},
  {category:'Subscription Failure',risk:14990,recovered:4800,rate:32,strategy:'Smart retry'},
];
