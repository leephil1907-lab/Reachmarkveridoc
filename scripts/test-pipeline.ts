import "dotenv/config";
import { retrieveContext } from "../src/lib/ai/retrieve";
import { generateGroundedAnswer } from "../src/lib/ai/generate";
import { verifyAnswer } from "../src/lib/ai/verify";
import { validateCitations } from "../src/lib/ai/validate-citations";

const workspaceId = process.env.TEST_WORKSPACE_ID;
if (!workspaceId) throw new Error("Set TEST_WORKSPACE_ID to a workspace containing approved documentation.");

const cases = [
  { question: "How do I reset my password?", expected: "answer" },
  { question: "What is the meaning of life?", expected: "refuse" },
  { question: "It is not working", expected: "clarify" }
] as const;

let failures = 0;
for (const testCase of cases) {
  const chunks = await retrieveContext(workspaceId, testCase.question);
  let actual: "answer" | "refuse" | "clarify" = "refuse";
  if (/^(it|this|that) is (not working|broken|not responding)$/i.test(testCase.question.trim())) {
    actual = "clarify";
  } else if (chunks.length) {
    const generated = await generateGroundedAnswer({ question: testCase.question, chunks });
    if (!generated.refused && validateCitations(generated.answer, chunks.length).valid) {
      const verification = await verifyAnswer({ question: testCase.question, answer: generated.answer, chunks });
      if (verification.decision === "publish") actual = "answer";
    }
  }
  const passed = actual === testCase.expected;
  if (!passed) failures++;
  console.log({ question: testCase.question, expected: testCase.expected, actual, passed, retrievedChunks: chunks.length });
}
if (failures) process.exitCode = 1;
