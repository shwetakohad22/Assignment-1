// Spec §8 "Check → requirement map" (FR-42), ranges expanded to individual IDs.

function range(prefix, from, to) {
  const out = [];
  for (let n = from; n <= to; n += 1) out.push(`${prefix}-${String(n).padStart(2, '0')}`);
  return out;
}

export const CHECKS_MAP = Object.freeze({
  'CHK-SCH-01': ['INV-01', 'FR-01', 'AC-23'],
  'CHK-SCH-02': ['INV-02', 'FR-08'],
  'CHK-SCH-03': ['INV-03', 'FR-08', 'FR-10'],
  'CHK-SCH-04': ['INV-04', 'FR-08'],
  'CHK-INV-05': ['INV-05', 'FR-09'],
  'CHK-INV-06': ['INV-06', 'FR-17'],
  'CHK-INV-07': ['INV-07', 'FR-13'],
  'CHK-INV-08': ['INV-08', 'FR-14'],
  'CHK-INV-09': ['INV-09', 'FR-18'],
  'CHK-INV-10': ['INV-10', 'FR-18'],
  'CHK-INV-11': ['INV-11', 'FR-14'],
  'CHK-INV-12': ['INV-12', 'FR-16h', 'GR-07'],
  'CHK-INV-13': ['INV-13', 'GR-02', 'GR-07'],
  'CHK-PROP-INTENT': [...range('BP', 1, 8), ...range('FR', 11, 15)],
  'CHK-PROP-STATUS': ['FR-09', 'GR-06'],
  'CHK-PROP-REASON': ['FR-09', 'FR-14', ...range('GR', 1, 3)],
  'CHK-SEM-TASK': ['FR-27', 'BP-06'],
  'CHK-SEM-TIME': ['FR-28', 'FR-17'],
  'CHK-DATA': ['FR-23', 'AC-19'],
  'CHK-VERDICT': [...range('FR', 32, 34), 'AC-20'],
  'CHK-SVC': [...range('FR', 36, 40), 'AC-21', 'AC-25'],
  'CHK-SECRET': ['FR-16h', 'FR-24', 'AC-22'],
});
