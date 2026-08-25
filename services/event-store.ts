const processed = new Set<string>();
export function claimWebhookEvent(id:string){if(processed.has(id))return false;processed.add(id);return true;}
export function resetWebhookEvents(){processed.clear();}
