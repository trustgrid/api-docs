import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, '..', 'index.yaml');
const spec = parse(readFileSync(specPath, 'utf8'));

function getParameter(pathKey, name) {
  const parameters = spec.paths?.[pathKey]?.get?.parameters;
  assert.ok(parameters, `${pathKey} should define query parameters`);

  const parameter = parameters.find((item) => item.name === name);
  assert.ok(parameter, `${pathKey} should include ${name}`);
  return parameter;
}

describe('Flow log time query parameters', () => {
  for (const pathKey of ['/audit/tail/flow_logs', '/v2/audit/flow-logs']) {
    it(`${pathKey} documents sTime as a flow start time lower bound`, () => {
      const parameter = getParameter(pathKey, 'sTime');

      assert.match(
        parameter.description,
        /lower bound/i,
        'sTime should describe the lower bound'
      );
      assert.match(
        parameter.description,
        /flow start time/i,
        'sTime should explicitly refer to flow start time'
      );
    });

    it(`${pathKey} documents eTime as a flow start time upper bound, not an end-time filter`, () => {
      const parameter = getParameter(pathKey, 'eTime');

      assert.match(
        parameter.description,
        /upper bound/i,
        'eTime should describe the upper bound'
      );
      assert.match(
        parameter.description,
        /flow start time/i,
        'eTime should explicitly refer to flow start time'
      );
      assert.match(
        parameter.description,
        /does not filter by flow end time/i,
        'eTime should explicitly rule out end-time filtering'
      );
    });

    it(`${pathKey} documents eTimeOp as applying to the eTime start-time bound`, () => {
      const parameter = getParameter(pathKey, 'eTimeOp');

      assert.match(
        parameter.description,
        /eTime/i,
        'eTimeOp should mention eTime'
      );
      assert.match(
        parameter.description,
        /flow start time bound/i,
        'eTimeOp should describe the start-time bound'
      );
      assert.match(
        parameter.description,
        /no end-time query filter/i,
        'eTimeOp should explicitly rule out end-time queries'
      );
    });
  }
});
