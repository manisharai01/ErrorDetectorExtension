import { Issue } from '../rules-engine/types';
import { registry } from '../rules-engine/registry';

const SEVERITY_TO_SARIF: Record<string, string> = {
  error: 'error', warning: 'warning', info: 'note'
};

export function toSarif(issues: Issue[]): string {
  const ruleIds = [...new Set(issues.map(i => i.ruleId))];
  const rules = ruleIds.map(id => {
    const r = registry.get(id);
    return {
      id,
      name: r?.meta.name ?? id,
      shortDescription: { text: r?.meta.name ?? id },
      fullDescription: { text: r?.meta.description ?? '' },
      defaultConfiguration: { level: SEVERITY_TO_SARIF[r?.meta.defaultSeverity ?? 'warning'] }
    };
  });
  const results = issues.map(i => ({
    ruleId: i.ruleId,
    level: SEVERITY_TO_SARIF[i.severity],
    message: { text: i.message },
    locations: [{
      physicalLocation: {
        artifactLocation: { uri: i.filePath.replace(/\\/g, '/') },
        region: {
          startLine: i.location.startLine,
          startColumn: i.location.startCol,
          endLine: i.location.endLine,
          endColumn: i.location.endCol
        }
      }
    }]
  }));
  return JSON.stringify({
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'Invisible Errors Detector', version: '0.1.0', informationUri: 'https://example.invalid/', rules } },
      results
    }]
  }, null, 2);
}
