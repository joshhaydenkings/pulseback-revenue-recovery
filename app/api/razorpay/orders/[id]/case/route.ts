import { findRecoveryCaseForOrder } from '../../../../../../services/razorpay-order-service';
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; const recovery = await findRecoveryCaseForOrder(id); return Response.json({ found: Boolean(recovery), recovery }); }
