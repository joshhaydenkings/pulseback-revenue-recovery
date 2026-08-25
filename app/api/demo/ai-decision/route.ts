import { z } from "zod";
import { analyzeAIDecisionTestScenario } from "../../../../services/ai-decision-test-service";

const schema = z.object({
  scenario: z.enum([
    "authentication_failure",
    "insufficient_funds",
    "bank_timeout",
    "high_value_failure",
    "exhausted_contact_limit",
    "repeated_failure",
  ]),
});

export async function POST(request: Request) {
  try {
    const { scenario } = schema.parse(await request.json());
    return Response.json(await analyzeAIDecisionTestScenario(scenario));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to analyze scenario",
      },
      { status: 400 },
    );
  }
}
