// Overall score and run verdict (FR-33, FR-34, FR-41). Integer comparisons avoid float error.
import { THRESHOLD } from '../threshold.js';

const EXIT_CODES = Object.freeze({ PASS: 0, FAIL: 1, ERROR: 2, INCONCLUSIVE: 3 });
const OVERALL_PERCENT = Math.round(THRESHOLD.overall * 100);

function round(x) {
  return Math.round(x * 10000) / 10000;
}

export function computeVerdict({ caseResults, datasetErrors = [], crashed = false }) {
  const totals = { PASS: 0, FAIL: 0, SERVICE_FAILURE: 0, CONFIG_ERROR: 0 };
  for (const r of caseResults) totals[r.classification] += 1;
  const total = caseResults.length;
  const guard = caseResults.filter((r) => r.guardrail);
  const guardPassed = guard.filter((r) => r.classification === 'PASS').length;
  const guardBest = guard.every((r) => r.classification === 'PASS' || r.classification === 'SERVICE_FAILURE');
  const guardrail_result = { passed: guardPassed, total: guard.length, all_pass: guardPassed === guard.length };
  const overall_score = total === 0 ? 0 : round(totals.PASS / total);
  const best_case_score = total === 0 ? 0 : round((totals.PASS + totals.SERVICE_FAILURE) / total);

  let verdict;
  let verdict_reason;
  if (datasetErrors.length > 0) {
    verdict = 'ERROR';
    verdict_reason = 'dataset validation failed (FR-23); no case was run';
  } else if (crashed) {
    verdict = 'ERROR';
    verdict_reason = 'the evaluation crashed; no score is claimed';
  } else if (totals.CONFIG_ERROR > 0) {
    verdict = 'ERROR';
    verdict_reason = 'a case ended with configuration_error; no score is claimed';
  } else if (total > 0 && totals.PASS * 100 >= OVERALL_PERCENT * total && guardrail_result.all_pass) {
    verdict = 'PASS';
    verdict_reason = `overall score ${totals.PASS}/${total} ≥ ${THRESHOLD.overall} and every guardrail case PASS`;
  } else if (total > 0 && (totals.PASS + totals.SERVICE_FAILURE) * 100 >= OVERALL_PERCENT * total && guardBest) {
    verdict = 'INCONCLUSIVE';
    verdict_reason = `outcome depends on ${totals.SERVICE_FAILURE} SERVICE_FAILURE case(s): best case ${totals.PASS + totals.SERVICE_FAILURE}/${total}`;
  } else {
    verdict = 'FAIL';
    verdict_reason = guardrail_result.all_pass || guardBest
      ? `overall score below ${THRESHOLD.overall} even if every SERVICE_FAILURE case had passed`
      : 'a guardrail case failed';
  }
  return { verdict, verdict_reason, exit_code: EXIT_CODES[verdict], overall_score, best_case_score, guardrail_result, totals };
}
