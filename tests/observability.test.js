/**
 * Tests for the v2 observability Destinations / Pipelines API
 * Validates that the spec matches the portal backend (ObservabilityDestinationController,
 * ObservabilityPipelineController) and that the removed v1 exporter API is gone
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, '..', 'index.yaml');
const spec = parse(readFileSync(specPath, 'utf8'));

const READ = 'observability::read';
const MODIFY = 'observability::modify';

// [path, verb, permission]; every route sits behind the `observability` feature flag
const OPERATIONS = [
  ['/v2/observability/destinations', 'get', READ],
  ['/v2/observability/destinations', 'post', MODIFY],
  ['/v2/observability/destinations/{uid}', 'get', READ],
  ['/v2/observability/destinations/{uid}', 'put', MODIFY],
  ['/v2/observability/destinations/{uid}', 'delete', MODIFY],
  ['/v2/observability/pipelines', 'get', READ],
  ['/v2/observability/pipelines', 'post', MODIFY],
  ['/v2/observability/pipelines/{uid}', 'get', READ],
  ['/v2/observability/pipelines/{uid}', 'put', MODIFY],
  ['/v2/observability/pipelines/{uid}', 'delete', MODIFY],
  ['/v2/observability/pipelines/{uid}/enable', 'post', MODIFY],
  ['/v2/observability/pipelines/{uid}/disable', 'post', MODIFY],
  ['/v2/observability/attribute-catalog', 'get', READ],
];

const op = (path, verb) => spec.paths?.[path]?.[verb];

describe('Removed v1 observability exporter API', () => {
  it('has no /v2/observability-exporter paths (removed from the portal)', () => {
    const paths = Object.keys(spec.paths).filter((p) => p.startsWith('/v2/observability-exporter'));
    assert.deepEqual(paths, []);
  });

  it('has no exporter tags or tag group entries', () => {
    const exporterTags = ['ObservabilityExporter', 'SplunkExporter', 'HTTPExporter'];
    const tags = spec.tags.map((t) => t.name);
    const grouped = spec['x-tagGroups'].flatMap((g) => g.tags);
    for (const name of exporterTags) {
      assert.ok(!tags.includes(name), `tag ${name} should be removed`);
      assert.ok(!grouped.includes(name), `x-tagGroups entry ${name} should be removed`);
    }
  });

  it('has no exporter request bodies or schemas', () => {
    for (const name of ['ObservabilityExporter', 'SplunkExporter', 'HTTPExporter']) {
      assert.equal(spec.components.requestBodies[name], undefined, `requestBody ${name}`);
      assert.equal(spec.components.schemas[name], undefined, `schema ${name}`);
    }
  });
});

describe('Observability tags', () => {
  const tags = ['ObservabilityDestination', 'ObservabilityPipeline', 'ObservabilityCatalog'];

  it('defines the destination, pipeline and catalog tags', () => {
    const names = spec.tags.map((t) => t.name);
    for (const name of tags) assert.ok(names.includes(name), `tag ${name} should exist`);
  });

  it('lists them under the Management tag group', () => {
    const management = spec['x-tagGroups'].find((g) => g.name === 'Management');
    assert.ok(management, 'Management tag group should exist');
    for (const name of tags) assert.ok(management.tags.includes(name), `${name} should be grouped`);
  });
});

describe('Observability operations', () => {
  for (const [path, verb, permission] of OPERATIONS) {
    describe(`${verb.toUpperCase()} ${path}`, () => {
      it('is defined', () => {
        assert.ok(op(path, verb), `${verb} ${path} should exist`);
      });

      it(`documents ${permission} and the observability feature flag after the --- separator`, () => {
        const description = op(path, verb)?.description;
        assert.ok(description, 'description should exist');
        const [, permissionLine] = description.split('\n\n---\n\n');
        const line = permissionLine ?? description;
        assert.ok(line.includes(`\`${permission}\``), `should require ${permission}`);
        assert.ok(line.includes('`observability` feature'), 'should require the observability feature');
      });

      it('documents the plain-text 403 for a missing permission or feature', () => {
        const res = op(path, verb)?.responses?.['403'];
        assert.ok(res, '403 should exist');
        assert.equal(res.content?.['text/plain']?.schema?.type, 'string');
      });

      if (path.includes('{uid}')) {
        it('documents a 404 using ObservabilityNotFound', () => {
          const res = op(path, verb)?.responses?.['404'];
          assert.ok(res, '404 should exist');
          assert.ok(res.description.toLowerCase().includes('not found'));
          assert.equal(
            res.content?.['application/json']?.schema?.$ref,
            '#/components/schemas/ObservabilityNotFound'
          );
        });
      }
    });
  }
});

describe('Observability request bodies', () => {
  const bodies = {
    '/v2/observability/destinations': 'ObservabilityDestination',
    '/v2/observability/destinations/{uid}': 'ObservabilityDestination',
    '/v2/observability/pipelines': 'ObservabilityPipeline',
    '/v2/observability/pipelines/{uid}': 'ObservabilityPipeline',
  };

  for (const [path, name] of Object.entries(bodies)) {
    const verb = path.endsWith('{uid}') ? 'put' : 'post';
    it(`${verb.toUpperCase()} ${path} uses components/requestBodies/${name}`, () => {
      assert.equal(op(path, verb)?.requestBody?.$ref, `#/components/requestBodies/${name}`);
    });
  }

  it('create returns only the new uid', () => {
    for (const path of ['/v2/observability/destinations', '/v2/observability/pipelines']) {
      const schema = op(path, 'post')?.responses?.['200']?.content?.['application/json']?.schema;
      assert.ok(schema, `${path} POST 200 should have a body`);
      assert.deepEqual(Object.keys(schema.properties), ['uid']);
    }
  });

  it('enable, disable and delete return the OK acknowledgement (backend sends { ok: true })', () => {
    for (const [path, verb] of [
      ['/v2/observability/pipelines/{uid}/enable', 'post'],
      ['/v2/observability/pipelines/{uid}/disable', 'post'],
      ['/v2/observability/pipelines/{uid}', 'delete'],
      ['/v2/observability/destinations/{uid}', 'delete'],
    ]) {
      const res = op(path, verb)?.responses?.['200'];
      assert.ok(res, `${verb} ${path} 200 should exist`);
      assert.equal(res.content?.['application/json']?.schema?.$ref, '#/components/schemas/OK');
    }
  });

  it('OK is { ok: boolean } with ok required', () => {
    const schema = spec.components.schemas.OK;
    assert.ok(schema, 'OK schema should exist');
    assert.equal(schema.properties.ok.type, 'boolean');
    assert.deepEqual(schema.required, ['ok']);
  });
});

describe('Observability 409 and 422 responses', () => {
  const conflicts = [
    ['/v2/observability/destinations', 'post'],
    ['/v2/observability/destinations/{uid}', 'put'],
    ['/v2/observability/destinations/{uid}', 'delete'],
    ['/v2/observability/pipelines', 'post'],
  ];
  const validations = [
    ['/v2/observability/destinations', 'post'],
    ['/v2/observability/destinations/{uid}', 'put'],
    ['/v2/observability/pipelines', 'post'],
    ['/v2/observability/pipelines/{uid}', 'put'],
  ];

  for (const [path, verb] of conflicts) {
    it(`${verb.toUpperCase()} ${path} 409 uses ObservabilityConflict`, () => {
      assert.equal(
        op(path, verb)?.responses?.['409']?.content?.['application/json']?.schema?.$ref,
        '#/components/schemas/ObservabilityConflict'
      );
    });
  }

  for (const [path, verb] of validations) {
    it(`${verb.toUpperCase()} ${path} 422 uses ObservabilityValidationFailed`, () => {
      const res = op(path, verb)?.responses?.['422'];
      assert.ok(res, '422 should exist');
      assert.ok(res.description.toLowerCase().includes('validation'));
      assert.equal(
        res.content?.['application/json']?.schema?.$ref,
        '#/components/schemas/ObservabilityValidationFailed'
      );
    });
  }

  it('ObservabilityConflict is { error: string[], references }', () => {
    const schema = spec.components.schemas.ObservabilityConflict;
    assert.ok(schema, 'ObservabilityConflict should exist');
    assert.equal(schema.properties.error.type, 'array');
    assert.deepEqual(schema.properties.references.items.required, ['uid', 'name']);
    assert.deepEqual(schema.required, ['error']);
  });

  it('ObservabilityValidationFailed wraps ValidationFailed in error (backend sends { error: [...] })', () => {
    const schema = spec.components.schemas.ObservabilityValidationFailed;
    assert.ok(schema, 'ObservabilityValidationFailed should exist');
    assert.equal(schema.properties.error.$ref, '#/components/schemas/ValidationFailed');
  });
});

describe('Observability schemas', () => {
  const schemas = spec.components.schemas;

  it('ObservabilityDestination documents redacted, write-only secrets', () => {
    const schema = schemas.ObservabilityDestination;
    assert.ok(schema, 'ObservabilityDestination should exist');
    assert.match(schema.description, /write-only/);
    assert.match(schema.description, /`""` means "set but hidden"/);
    assert.match(schema.description, /re-entered when the endpoint scheme, host or port changes/);
  });

  it('uid is optional on create and must be a UUID', () => {
    for (const name of ['ObservabilityDestination', 'ObservabilityPipeline']) {
      const schema = schemas[name];
      assert.ok(!schema.required.includes('uid'), `${name}.uid should not be required`);
      assert.match(schema.properties.uid.description, /must be a UUID/);
    }
  });

  it('expresses limits as schema keywords', () => {
    const dest = schemas.ObservabilityDestination.properties;
    assert.equal(dest.name.maxLength, 100);
    assert.equal(dest.headers.maxProperties, 50);
    assert.equal(dest.accepts.minItems, 1);
    const pipe = schemas.ObservabilityPipeline.properties;
    assert.equal(pipe.destinationUids.maxItems, 50);
    assert.equal(pipe.attributes.maxItems, 200);
    assert.equal(pipe.constants.maxProperties, 50);
    assert.equal(schemas.ObservabilitySelector.properties.tagMatches.maxProperties, 50);
  });

  it('ObservabilitySignal is metrics or logs', () => {
    assert.deepEqual(schemas.ObservabilitySignal.enum, ['metrics', 'logs']);
  });

  it('every $ref under an Observability schema resolves', () => {
    const refs = JSON.stringify(
      Object.entries(schemas).filter(([name]) => name.startsWith('Observability'))
    ).match(/#\/components\/schemas\/\w+/g);
    for (const ref of refs) {
      const name = ref.split('/').pop();
      assert.ok(schemas[name], `${ref} should resolve`);
    }
  });
});
