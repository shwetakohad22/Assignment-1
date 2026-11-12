// quality_gates (spec FR-40, constitution Quality Gates). Reported only: never changes the verdict.

const RULES = Object.freeze({
  lint: 'established by the recorded lint run (0 errors)',
  secrets: "CHK-SECRET clean on report, summary and every case's stderr and stdout",
  schema: 'every non-SERVICE_FAILURE case passes Layer 1',
  invariant: 'no failed CHK-INV check; no guardrail case FAIL',
  evaluation: 'verdict PASS → PASS; FAIL → FAIL; INCONCLUSIVE/ERROR → NOT_EVALUATED',
  traceability: 'dataset validation passed; every emitted check ID is in checks_map',
  failure_reporting: 'every SERVICE_FAILURE case listed with ID and failure_kind',
});

const gate = (name, result) => ({ result, rule: RULES[name] });
const pf = (ok) => (ok ? 'PASS' : 'FAIL');

export function computeGates({
  caseResults,
  verdict,
  datasetErrors,
  serviceFailureIds,
  stderrSecretHits,
  stdoutSecretHits,
  reportSecretHit,
  checksMap,
}) {
  const ran = datasetErrors.length === 0 && caseResults.length > 0;
  const evaluated = caseResults.filter((r) => r.classification === 'PASS' || r.classification === 'FAIL');
  const emitted = caseResults.flatMap((r) => [...(r.layer1?.failed ?? []), ...(r.layer2?.failed ?? [])]);

  const schemaOk = caseResults.filter((r) => r.classification !== 'SERVICE_FAILURE').every((r) => r.layer1.pass === true);
  const invariantOk =
    !evaluated.some((r) => (r.layer2?.failed ?? []).some((id) => id.startsWith('CHK-INV-'))) &&
    !caseResults.some((r) => r.guardrail && r.classification === 'FAIL');
  const listed = new Map(serviceFailureIds.map((s) => [s.id, s.failure_kind]));
  const reportingOk = caseResults
    .filter((r) => r.classification === 'SERVICE_FAILURE')
    .every((r) => listed.has(r.id) && typeof listed.get(r.id) === 'string' && typeof r.failure_kind === 'string');

  let evaluation = 'NOT_EVALUATED';
  if (verdict === 'PASS') evaluation = 'PASS';
  if (verdict === 'FAIL') evaluation = 'FAIL';

  return {
    lint: gate('lint', 'NOT_EVALUATED'),
    secrets: gate('secrets', pf(stderrSecretHits.length === 0 && stdoutSecretHits.length === 0 && !reportSecretHit)),
    schema: gate('schema', ran ? pf(schemaOk) : 'NOT_EVALUATED'),
    invariant: gate('invariant', ran ? pf(invariantOk) : 'NOT_EVALUATED'),
    evaluation: gate('evaluation', evaluation),
    traceability: gate('traceability', pf(datasetErrors.length === 0 && emitted.every((id) => Object.prototype.hasOwnProperty.call(checksMap, id)))),
    failure_reporting: gate('failure_reporting', ran ? pf(reportingOk) : 'NOT_EVALUATED'),
  };
}
