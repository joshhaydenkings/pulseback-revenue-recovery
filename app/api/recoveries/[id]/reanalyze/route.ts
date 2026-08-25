import { getRecoveryRepository } from "../../../../../repositories/recovery-repository";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return Response.json(await getRecoveryRepository().reanalyzeCase(id));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to re-analyze case",
      },
      { status: 400 },
    );
  }
}
