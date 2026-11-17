/**
 * Tests for the observability activity search and category catalog API (WOR-13071)
 * Validates that the spec matches the portal backend
 * (ObservabilityTroubleshootingController, OtelActivitySearch, OtelActivityCategories)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, '..', 'index.yaml');
const specText = readFileSync(specPath, 'utf8');
const spec = parse(specText);

const SEARCH = '/v2/observability/activity/search';
const CATEGORIES = '/v2/observability/activity/categories';
const OPERATOR_SEARCH = '/v2/observability/activity/operator/search';
const OPERATOR_CATEGORIES = '/v2/observability/activity/operator/categories';
const OPERATOR_PERMISSION = 'trustgrid::portal:operator-activity:read';

const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;

const schemas = spec.components?.schemas ?? {};
const parameters = spec.components?.parameters ?? {};
const op = (path, verb = 'get') => spec.paths?.[path]?.[verb];

const resolveParam = (p) => {
  if (!p.$ref) {
    return p;
  }
  const name = p.$ref.replace('#/components/parameters/', '');
  assert.ok(parameters[name], `parameter ${p.$ref} should exist`);
  return parameters[name];
};

const paramsOf = (path) => {
  const operation = op(path);
  assert.ok(operation, `GET ${path} should exist`);
  return Object.fromEntries((operation.parameters ?? []).map(resolveParam).map((p) => [p.name, p]));
};

const schemaOf = (param) => {
  const s = param.schema;
  return s?.$ref ? schemas[s.$ref.replace('#/components/schemas/', '')] : s;
};

const itemEnum = (param) => {
  const items = param.schema?.items;
  const resolved = items?.$ref ? schemas[items.$ref.replace('#/components/schemas/', '')] : items;
  return resolved?.enum;
};

describe('Activity path definitions', () => {
  it('defines exactly the four activity paths under /v2/observability/activity', () => {
    const activity = Object.keys(spec.paths).filter((p) => p.startsWith('/v2/observability/activity'));
    assert.deepEqual(activity.sort(), [CATEGORIES, OPERATOR_CATEGORIES, OPERATOR_SEARCH, SEARCH].sort());
  });

  // The controller has no legacy array endpoint and no /api/v2/activity mount
  it('does not define GET /v2/observability/activity or /v2/activity', () => {
    assert.equal(spec.paths['/v2/observability/activity'], undefined);
    assert.equal(spec.paths['/v2/activity'], undefined);
    assert.equal(spec.paths['/api/v2/activity'], undefined);
  });

  it('has no separate history endpoint', () => {
    assert.ok(!Object.keys(spec.paths).some((p) => /activity.*history/.test(p)));
  });

  for (const path of [SEARCH, CATEGORIES, OPERATOR_SEARCH, OPERATOR_CATEGORIES]) {
    it(`${path} only has GET`, () => {
      assert.deepEqual(
        Object.keys(spec.paths[path]).filter((k) => k !== 'parameters'),
        ['get'],
      );
    });
  }

  it('uses unique operationIds', () => {
    assert.equal(op(SEARCH).operationId, 'searchObservabilityActivity');
    assert.equal(op(CATEGORIES).operationId, 'listObservabilityActivityCategories');
    assert.equal(op(OPERATOR_SEARCH).operationId, 'searchObservabilityOperatorActivity');
    assert.equal(op(OPERATOR_CATEGORIES).operationId, 'listObservabilityOperatorActivityCategories');
  });

  it('activity paths sort before the other /v2/observability paths', () => {
    const keys = Object.keys(spec.paths);
    const firstOther = keys.findIndex((p) => p.startsWith('/v2/observability/') && !p.startsWith('/v2/observability/activity'));
    const activity = keys.filter((p) => p.startsWith('/v2/observability/activity'));
    assert.ok(activity.every((p) => keys.indexOf(p) < firstOther));
    assert.deepEqual(activity, [...activity].sort());
  });
});

describe('Activity tags', () => {
  it('defines tenant and operator activity tags with a docs link', () => {
    for (const name of ['ObservabilityActivity', 'ObservabilityOperatorActivity']) {
      const tag = spec.tags.find((t) => t.name === name);
      assert.ok(tag, `${name} tag should exist`);
      assert.match(tag.description, /https:\/\/docs\.trustgrid\.io\/docs\/observability\//);
    }
  });

  it('lists both tags in the Management tag group', () => {
    const group = spec['x-tagGroups'].find((g) => g.name === 'Management');
    assert.ok(group.tags.includes('ObservabilityActivity'));
    assert.ok(group.tags.includes('ObservabilityOperatorActivity'));
  });

  it('tags tenant and operator operations separately', () => {
    assert.deepEqual(op(SEARCH).tags, ['ObservabilityActivity']);
    assert.deepEqual(op(CATEGORIES).tags, ['ObservabilityActivity']);
    assert.deepEqual(op(OPERATOR_SEARCH).tags, ['ObservabilityOperatorActivity']);
    assert.deepEqual(op(OPERATOR_CATEGORIES).tags, ['ObservabilityOperatorActivity']);
  });
});

describe('Activity permissions', () => {
  // Tenant routes: JWTFilter, FeatureCheck(feature::observability), PermissionCheck(observability::read)
  for (const path of [SEARCH, CATEGORIES]) {
    it(`${path} requires observability::read and the observability feature`, () => {
      const [, permission] = op(path).description.split('\n---\n');
      assert.ok(permission, 'description should have a --- separator before the permission line');
      assert.match(permission, /`observability::read`/);
      assert.match(permission, /`observability` feature/);
      assert.match(op(path).responses['403'].description, /Feature not enabled/);
    });
  }

  // Operator routes: JWTFilter, PermissionCheck(trustgrid::portal:operator-activity:read); no FeatureCheck
  for (const path of [OPERATOR_SEARCH, OPERATOR_CATEGORIES]) {
    it(`${path} requires only ${OPERATOR_PERMISSION}`, () => {
      const [, permission] = op(path).description.split('\n---\n');
      assert.ok(permission, 'description should have a --- separator before the permission line');
      assert.match(permission, new RegExp(`\`${OPERATOR_PERMISSION}\``));
      assert.doesNotMatch(permission, /observability::read/);
      assert.doesNotMatch(op(path).responses['403'].description, /Feature not enabled/);
    });
  }

  // PermissionCheck and FeatureCheck answer with res.status(403).end(text), not JSON
  for (const path of [SEARCH, CATEGORIES, OPERATOR_SEARCH, OPERATOR_CATEGORIES]) {
    it(`${path} documents plain-text 401 and 403 bodies`, () => {
      assert.ok(op(path).responses['401'].content['text/plain']);
      assert.ok(op(path).responses['403'].content['text/plain']);
    });
  }

  it('has no organization parameter on tenant search', () => {
    const names = Object.keys(paramsOf(SEARCH)).map((n) => n.toLowerCase());
    assert.ok(!names.includes('orgid'));
  });
});

describe('Activity search parameters', () => {
  const REPEATABLE = {
    sources: ['source', ['portal', 'collector', 'ray']],
    severities: ['severity', ['info', 'warn', 'error']],
    signals: ['signal', ['metrics', 'logs']],
    categories: ['category', undefined],
    destinationIDs: ['destinationID', undefined],
    pipelineIDs: ['pipelineID', undefined],
    components: ['component', undefined],
  };

  for (const path of [SEARCH, OPERATOR_SEARCH]) {
    const params = paramsOf(path);

    it(`${path} uses only $ref parameters`, () => {
      assert.ok(op(path).parameters.every((p) => p.$ref));
    });

    for (const [plural, [singular, values]] of Object.entries(REPEATABLE)) {
      it(`${path} ${plural} is a repeatable form array with singular alias ${singular}`, () => {
        const p = params[plural];
        assert.ok(p, `${plural} should exist`);
        assert.equal(p.in, 'query');
        assert.equal(p.schema.type, 'array');
        assert.equal(p.style, 'form');
        assert.equal(p.explode, true);
        // queryValues: at most 100 values
        assert.equal(p.schema.maxItems, 100);
        assert.match(p.description, new RegExp(`\`${singular}\``));
        assert.ok(params[singular], `${singular} alias should exist`);
        assert.notEqual(schemaOf(params[singular]).type, 'array');
        if (values) {
          assert.deepEqual([...itemEnum(p)].sort(), [...values].sort());
          assert.deepEqual([...schemaOf(params[singular]).enum].sort(), [...values].sort());
        } else {
          // categories come from the catalog, not a fixed list
          assert.equal(itemEnum(p), undefined);
          assert.equal(p.schema.items.maxLength, 256);
        }
      });
    }

    it(`${path} limits text to 256 and cursor to 4096 characters`, () => {
      assert.equal(params.text.schema.maxLength, 256);
      assert.equal(params.cursor.schema.maxLength, 4096);
      for (const s of ['category', 'destinationID', 'pipelineID', 'component']) {
        assert.equal(params[s].schema.maxLength, 256);
      }
    });

    it(`${path} documents RFC3339 start and end`, () => {
      assert.equal(params.start.schema.format, 'date-time');
      assert.equal(params.end.schema.format, 'date-time');
    });

    it(`${path} requires a positive integer pageSize`, () => {
      assert.equal(params.pageSize.schema.type, 'integer');
      assert.equal(params.pageSize.schema.minimum, 1);
    });

    it(`${path} validates fingerprint with ^sha256:[0-9a-f]{64}$`, () => {
      assert.equal(params.fingerprint.schema.pattern, '^sha256:[0-9a-f]{64}$');
      assert.match(params.fingerprint.example, FINGERPRINT);
    });

    it(`${path} sort and order match ACTIVITY_SORTS`, () => {
      assert.deepEqual(params.sort.schema.enum, [
        'lastSeen', 'activity', 'destination', 'pipeline', 'signal', 'category', 'severity', 'outcome',
      ]);
      assert.deepEqual(params.order.schema.enum, ['asc', 'desc']);
    });

    // sortLabels is built by the Portal from destination/pipeline/category names, never by callers
    it(`${path} does not expose sortLabels`, () => {
      assert.equal(params.sortLabels, undefined);
    });

    it(`${path} has every parameter in the query`, () => {
      assert.ok(Object.values(params).every((p) => p.in === 'query'));
    });
  }

  it('shows a repeated-value example', () => {
    assert.match(op(SEARCH).description, /signals=logs&signals=metrics/);
    assert.deepEqual(parameters.ObservabilityActivitySignals.example, ['logs', 'metrics']);
  });

  it('documents rejection of singular and plural together', () => {
    assert.match(op(SEARCH).description, /Use either signal or signals, not both/);
  });
});

describe('Activity search responses', () => {
  const response = schemas.ObservabilityActivitySearchResponse;
  const issue = schemas.ObservabilityActivityIssue;

  it('defines the search response with its required fields', () => {
    assert.ok(response);
    assert.deepEqual(
      [...response.required].sort(),
      ['documentCountIsLowerBound', 'hasMore', 'incomplete', 'issues', 'matchingDocuments'],
    );
    for (const f of ['limits', 'windowStart', 'windowEnd', 'nextCursor', 'bucketSeconds']) {
      assert.ok(response.properties[f], `${f} should be documented`);
      assert.ok(!response.required.includes(f), `${f} is optional`);
    }
  });

  it('documents every limit returned by the activity store', () => {
    assert.deepEqual(
      [...schemas.ObservabilityActivityLimits.required].sort(),
      ['defaultPageSize', 'defaultWindowSeconds', 'maxPageSize', 'maxWindowDays', 'retentionDays'],
    );
  });

  it('defines issue fields with optional destinationID and pipelineID', () => {
    for (const f of [
      'fingerprint', 'outcome', 'source', 'component', 'signal', 'severity', 'category',
      'reasonCode', 'message', 'firstSeen', 'lastSeen', 'documentCount', 'observedCount', 'buckets',
    ]) {
      assert.ok(issue.required.includes(f), `${f} should be required`);
    }
    for (const f of ['destinationID', 'pipelineID', 'objectType', 'objectID', 'operatorOnly']) {
      assert.ok(issue.properties[f], `${f} should be documented`);
      assert.ok(!issue.required.includes(f), `${f} is optional`);
    }
    assert.equal(issue.properties.fingerprint.pattern, '^sha256:[0-9a-f]{64}$');
  });

  it('enumerates outcomes from OtelActivityOutcome', () => {
    assert.deepEqual(
      [...schemas.ObservabilityActivityOutcome.enum].sort(),
      ['dropped', 'error', 'rejected', 'retrying', 'succeeded', 'unknown'],
    );
  });

  it('defines bucket summaries', () => {
    assert.deepEqual(
      [...schemas.ObservabilityActivityBucket.required].sort(),
      ['bucketStart', 'documentCount', 'firstSeen', 'lastSeen', 'observedCount'],
    );
  });

  it('includes cursor paging and fingerprint history examples', () => {
    const examples = op(SEARCH).responses['200'].content['application/json'].examples;
    const page = examples.multiValueSearchPage.value;
    assert.equal(page.hasMore, true);
    assert.equal(typeof page.nextCursor, 'string');
    assert.deepEqual(page.issues[0].buckets, []);
    const history = examples.fingerprintHistory.value;
    assert.equal(history.hasMore, false);
    assert.ok(history.bucketSeconds > 0);
    assert.ok(history.issues[0].buckets.length > 0);
    for (const ex of [page, history]) {
      assert.match(ex.issues[0].fingerprint, FINGERPRINT);
    }
  });

  // BadRequestError → core/error.js → 400 { error: [string] }; there is no 404 or 422 on these routes
  for (const path of [SEARCH, OPERATOR_SEARCH]) {
    it(`${path} documents 400 { error: [string] } and 500 { error: string }`, () => {
      const r = op(path).responses;
      assert.equal(r['400'].content['application/json'].schema.$ref, '#/components/schemas/ObservabilityActivityError');
      assert.equal(r['500'].content['application/json'].schema.$ref, '#/components/schemas/ObservabilityActivityInternalError');
      assert.equal(r['404'], undefined);
      assert.equal(r['422'], undefined);
      assert.ok(r['200'].content['application/json'].schema.$ref.endsWith('/ObservabilityActivitySearchResponse'));
    });
  }

  it('defines the 400 body as an array of messages', () => {
    assert.equal(schemas.ObservabilityActivityError.properties.error.type, 'array');
  });
});

describe('Activity category catalog', () => {
  const category = schemas.ObservabilityActivityCategory;

  it('defines {id,label,description,sources}', () => {
    assert.deepEqual([...category.required].sort(), ['description', 'id', 'label', 'sources']);
    assert.equal(category.properties.id.pattern, '^[a-z][a-z0-9_]{0,63}$');
  });

  // activityCategories answers 503 with { message }, not { error }
  for (const path of [CATEGORIES, OPERATOR_CATEGORIES]) {
    it(`${path} returns an array of categories and a 503 { message } body`, () => {
      const r = op(path).responses;
      assert.equal(r['200'].content['application/json'].schema.type, 'array');
      assert.equal(r['200'].content['application/json'].schema.items.$ref, '#/components/schemas/ObservabilityActivityCategory');
      assert.equal(r['503'].content['application/json'].schema.$ref, '#/components/schemas/ObservabilityActivityCatalogUnavailable');
    });
  }

  it('documents the exact 503 message', () => {
    assert.match(
      schemas.ObservabilityActivityCatalogUnavailable.properties.message.description,
      /Activity category catalog is unavailable/,
    );
  });
});

describe('Removed legacy activity feed wording', () => {
  // The Redis feed (7 days, 500 entries) was replaced by Librarian search with configurable limits
  const activityText = JSON.stringify([
    spec.paths[SEARCH], spec.paths[CATEGORIES], spec.paths[OPERATOR_SEARCH], spec.paths[OPERATOR_CATEGORIES],
    ...Object.entries(schemas).filter(([k]) => k.startsWith('ObservabilityActivity')).map(([, v]) => v),
    ...Object.entries(parameters).filter(([k]) => k.startsWith('ObservabilityActivity')).map(([, v]) => v),
    spec.tags.filter((t) => t.name.includes('Activity')),
  ]);

  it('does not mention Redis, a 7-day feed, 500 entries or a 30-day promise', () => {
    assert.doesNotMatch(activityText, /redis/i);
    assert.doesNotMatch(activityText, /7[- ]day/i);
    assert.doesNotMatch(activityText, /500 (entries|events|items)/i);
    assert.doesNotMatch(activityText, /30[- ]day/i);
  });

  it('never mentions sortLabels anywhere in the spec', () => {
    assert.doesNotMatch(specText, /sortLabels/);
  });
});
