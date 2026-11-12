// Case classification precedence (contracts/eval-report.md; FR-31, FR-36).

export function classifyRun({ exitCode, parsed }) {
  const reason = parsed !== null && typeof parsed === 'object' ? parsed.reason : undefined;
  if (exitCode === 2 || reason === 'configuration_error') return 'CONFIG_ERROR';
  if (exitCode === 3 || reason === 'model_service_failure') return 'SERVICE_FAILURE';
  return 'EVALUATED';
}
