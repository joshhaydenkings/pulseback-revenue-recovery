import { z } from "zod";
import { analyzeAIDecisionTestScenario } from "../../../../services/ai-decision-test-service";
import { invalidRequestResponse, safeErrorResponse } from "../../../../lib/http/safe-response";
import { enforceRateLimit, publicMutationLimits } from "../../../../lib/security/rate-limit";

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
  const limited = await enforceRateLimit(request, publicMutationLimits.demoAI);
  if (limited) return limited;
  try {
    const { scenario } = schema.parse(await request.json());
    return Response.json(await analyzeAIDecisionTestScenario(scenario));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return invalidRequestResponse("Invalid AI test scenario");
    }
    return safeErrorResponse(
      "demo-ai",
      error,
      "Unable to analyze the test scenario",
    );
  }
}
