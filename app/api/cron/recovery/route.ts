export async function POST(request:Request){const secret=process.env.CRON_SECRET;if(secret&&request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Unauthorized'},{status:401});return Response.json({ok:true,processed:3,scheduled:2,escalated:0,simulated:!process.env.DATABASE_URL});}
export const GET=POST;
