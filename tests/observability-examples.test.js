/**
 * Validates every example on the /v2/observability operations and on Observability* components
 * against its schema, so examples cannot drift from the documented Portal shapes (WOR-13071)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derefIn, validatorFor } from './helpers/openapi-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const spec = parse(readFileSync(join(__dirname, '..', 'index.yaml'), 'utf8'));
const deref = derefIn(spec);
const validate = validatorFor(spec);

const VERBS = ['get', 'put', 'post', 'delete', 'patch'];

const mediaExamples = (media) => [
  ...(media?.example === undefined ? [] : [['example', media.example]]),
  ...Object.entries(media?.examples ?? {}).map(([name, e]) => [name, deref(e).value]),
];

const collect = () => {
  const cases = [];
  const add = (label, schema, examples) => {
    for (const [name, value] of examples) cases.push({ label: `${label} ${name}`, schema, value });
  };
  const addMedia = (label, content) => {
    const media = content?.['application/json'];
    if (media?.schema) add(label, media.schema, mediaExamples(media));
  };

  for (const [path, item] of Object.entries(spec.paths).filter(([p]) => p.startsWith('/v2/observability/'))) {
    for (const verb of VERBS.filter((v) => item[v])) {
      const operation = item[verb];
      const where = `${verb.toUpperCase()} ${path}`;
      for (const param of [...(item.parameters ?? []), ...(operation.parameters ?? [])].map(deref)) {
        if (param.example !== undefined) add(`${where} parameter ${param.name}`, param.schema, [['example', param.example]]);
        add(`${where} parameter ${param.name}`, param.schema, mediaExamples({ examples: param.examples }));
      }
      addMedia(`${where} request`, deref(operation.requestBody)?.content);
      for (const [code, res] of Object.entries(operation.responses)) {
        addMedia(`${where} ${code}`, deref(res).content);
      }
    }
  }

  for (const [name, schema] of Object.entries(spec.components.schemas).filter(([n]) => n.startsWith('Observability'))) {
    if (schema.example !== undefined) add(`schema ${name}`, schema, [['example', schema.example]]);
  }
  return cases;
};

const cases = collect();

describe('Observability examples', () => {
  it('finds examples to check', () => {
    assert.ok(cases.length >= 40, `expected at least 40 examples, found ${cases.length}`);
  });

  it('covers every WOR-13071 acceptance example', () => {
    const labels = cases.map((c) => c.label);
    const required = {
      'full-replace destination update': 'PUT /v2/observability/destinations/{uid} request keepSecrets',
      'full-replace pipeline update': 'PUT /v2/observability/pipelines/{uid} request fullReplace',
      'redacted secret read': 'GET /v2/observability/destinations/{uid} 200 redactedHttp',
      'destination conflict': 'DELETE /v2/observability/destinations/{uid} 409 inUse',
      'blocked destination test': 'POST /v2/observability/destinations/test 200 blockedAddress',
      'publication status recorded': 'POST /v2/observability/destinations/{uid}/test 200 recorded',
      'publication status pending': 'POST /v2/observability/destinations/{uid}/test 200 pending',
      'publication status disabled': 'POST /v2/observability/destinations/{uid}/test 200 disabled',
      'publication status unavailable': 'POST /v2/observability/destinations/{uid}/test 200 unavailable',
      'record check': 'POST /v2/observability/pipelines/{uid}/check request nodeEvent',
      'multivalue search and cursor paging': 'GET /v2/observability/activity/search 200 multiValueSearchPage',
      'fingerprint history': 'GET /v2/observability/activity/search 200 fingerprintHistory',
    };
    for (const [what, label] of Object.entries(required)) {
      assert.ok(labels.includes(label), `${what}: ${label} should exist`);
    }
  });

  for (const { label, schema, value } of cases) {
    it(`${label} matches its schema`, () => {
      assert.deepEqual(validate(schema, value), []);
    });
  }
});
