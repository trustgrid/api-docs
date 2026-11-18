/**
 * Tests for the v2 observability Destinations / Pipelines API
 * Validates that the spec matches the portal backend (ObservabilityDestinationController,
 * ObservabilityPipelineController, data/OtelDestination.ts, data/OtelPipeline.ts and the
 * otelDestination / otelPipeline yup schemas) and that the removed v1 exporter API is gone
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
const schemas = spec.components.schemas;

// Follows a local $ref ('#/components/...') to its target; returns other values unchanged
const deref = (value) => {
  if (!value?.$ref) return value;
  const target = value.$ref.replace(/^#\//, '').split('/').reduce((node, key) => node?.[key], spec);
  assert.ok(target, `${value.$ref} should resolve`);
  return deref(target);
};

const response = (path, verb, code) => deref(op(path, verb)?.responses?.[code]);
const jsonSchemaRef = (path, verb, code) =>
  response(path, verb, code)?.content?.['application/json']?.schema?.$ref;
const examplesOf = (media) => [
  ...(media?.example === undefined ? [] : [media.example]),
  ...Object.values(media?.examples ?? {}).map((e) => e.value),
];

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
      assert.equal(schemas[name], undefined, `schema ${name}`);
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

      // PermissionCheck / FeatureCheck answer with res.end("Permission denied" | "Feature not enabled")
      it('uses the shared plain-text ObservabilityForbidden 403', () => {
        assert.equal(
          op(path, verb)?.responses?.['403']?.$ref,
          '#/components/responses/ObservabilityForbidden'
        );
      });

      if (path.includes('{uid}')) {
        it('uses a $ref uid path parameter and a 404 using ObservabilityNotFound', () => {
          const kind = path.includes('destinations') ? 'Destination' : 'Pipeline';
          assert.deepEqual(op(path, verb).parameters, [
            { $ref: `#/components/parameters/observability${kind}Uid` },
          ]);
          const res = response(path, verb, '404');
          assert.ok(res, '404 should exist');
          assert.ok(res.description.toLowerCase().includes('not found'));
          assert.equal(jsonSchemaRef(path, verb, '404'), '#/components/schemas/ObservabilityNotFound');
        });
      }
    });
  }
});

describe('Shared observability error components', () => {
  it('ObservabilityForbidden 403 is plain text listing the filter messages', () => {
    const res = spec.components.responses?.ObservabilityForbidden;
    assert.ok(res, 'components/responses/ObservabilityForbidden should exist');
    assert.equal(res.content['text/plain'].schema.$ref, '#/components/schemas/ObservabilityForbidden');
    // filters/PermissionCheck.ts and filters/JWTAuthenticated.ts
    assert.deepEqual(schemas.ObservabilityForbidden.enum, [
      'Permission denied',
      'Feature not enabled',
      'Disabled user; access denied',
      'Disallowed IP',
    ]);
  });

  // core/error handling in web.ts: ValidationError, BadRequestError and ConflictError send { error: string[] }
  it('ObservabilityErrors is { error: string[] }', () => {
    const schema = schemas.ObservabilityErrors;
    assert.ok(schema, 'ObservabilityErrors should exist');
    assert.equal(schema.properties.error.type, 'array');
    assert.equal(schema.properties.error.items.type, 'string');
    assert.deepEqual(schema.required, ['error']);
  });

  // NotFoundError is mapped to { error: "Not found" }, a single string
  it('ObservabilityNotFound is { error: "Not found" }', () => {
    assert.deepEqual(schemas.ObservabilityNotFound.properties.error.enum, ['Not found']);
  });

  it('ObservabilityMessageError is { message: string }', () => {
    assert.deepEqual(schemas.ObservabilityMessageError.required, ['message']);
  });

  it('a body that is not JSON is a 400 HTML page from the body parser, not a validation error', () => {
    const res = spec.components.responses?.ObservabilityMalformedJSON;
    assert.ok(res?.content?.['text/html'], 'ObservabilityMalformedJSON should be text/html');
    for (const [path, verb] of [
      ['/v2/observability/destinations', 'post'],
      ['/v2/observability/destinations/{uid}', 'put'],
      ['/v2/observability/pipelines', 'post'],
      ['/v2/observability/pipelines/{uid}', 'put'],
    ]) {
      assert.equal(
        op(path, verb)?.responses?.['400']?.$ref,
        '#/components/responses/ObservabilityMalformedJSON'
      );
    }
  });
});

describe('Observability request bodies', () => {
  const bodies = [
    ['/v2/observability/destinations', 'post', 'ObservabilityDestination'],
    ['/v2/observability/destinations/{uid}', 'put', 'ObservabilityDestinationUpdate'],
    ['/v2/observability/pipelines', 'post', 'ObservabilityPipeline'],
    ['/v2/observability/pipelines/{uid}', 'put', 'ObservabilityPipelineUpdate'],
  ];

  for (const [path, verb, name] of bodies) {
    it(`${verb.toUpperCase()} ${path} uses components/requestBodies/${name}`, () => {
      assert.equal(op(path, verb)?.requestBody?.$ref, `#/components/requestBodies/${name}`);
      const body = spec.components.requestBodies[name];
      assert.ok(body, `requestBody ${name} should exist`);
      const kind = name.startsWith('ObservabilityDestination') ? 'Destination' : 'Pipeline';
      assert.equal(
        body.content['application/json'].schema.$ref,
        `#/components/schemas/Observability${kind}`
      );
    });
  }

  it('PUT descriptions say the update is a full replacement', () => {
    for (const path of ['/v2/observability/destinations/{uid}', '/v2/observability/pipelines/{uid}']) {
      assert.match(op(path, 'put').description, /full replacement, not a patch/);
    }
  });

  it('the destination update examples send redacted secrets back as "" and re-enter them for a new endpoint', () => {
    const { examples } = spec.components.requestBodies.ObservabilityDestinationUpdate.content['application/json'];
    assert.equal(examples.keepSecrets.value.auth.token, '');
    assert.equal(examples.keepSecrets.value.headers['X-Scope-OrgID'], '');
    assert.notEqual(examples.newEndpoint.value.auth.token, '');
    assert.notEqual(examples.newEndpoint.value.endpoint, examples.keepSecrets.value.endpoint);
  });

  it('the pipeline update example is a whole pipeline', () => {
    const { examples } = spec.components.requestBodies.ObservabilityPipelineUpdate.content['application/json'];
    for (const field of schemas.ObservabilityPipeline.required) {
      assert.ok(field in examples.fullReplace.value, `full replace example should send ${field}`);
    }
  });

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
    const schema = schemas.OK;
    assert.ok(schema, 'OK schema should exist');
    assert.equal(schema.properties.ok.type, 'boolean');
    assert.deepEqual(schema.required, ['ok']);
  });
});

describe('Observability 409 and 422 responses', () => {
  // data/OtelDestination.ts and data/OtelPipeline.ts throw ConflictError on each of these
  const conflicts = [
    ['/v2/observability/destinations', 'post'],
    ['/v2/observability/destinations/{uid}', 'put'],
    ['/v2/observability/destinations/{uid}', 'delete'],
    ['/v2/observability/pipelines', 'post'],
    ['/v2/observability/pipelines/{uid}', 'put'],
  ];
  const validations = [
    ['/v2/observability/destinations', 'post'],
    ['/v2/observability/destinations/{uid}', 'put'],
    ['/v2/observability/pipelines', 'post'],
    ['/v2/observability/pipelines/{uid}', 'put'],
  ];

  for (const [path, verb] of conflicts) {
    it(`${verb.toUpperCase()} ${path} 409 uses ObservabilityConflict`, () => {
      assert.equal(jsonSchemaRef(path, verb, '409'), '#/components/schemas/ObservabilityConflict');
    });
  }

  for (const [path, verb] of validations) {
    it(`${verb.toUpperCase()} ${path} 422 uses ObservabilityValidationFailed`, () => {
      const res = response(path, verb, '422');
      assert.ok(res, '422 should exist');
      assert.ok(res.description.toLowerCase().includes('validation'));
      assert.equal(jsonSchemaRef(path, verb, '422'), '#/components/schemas/ObservabilityValidationFailed');
    });
  }

  it('ObservabilityConflict is { error: string[], references?: ObservabilityConflictReference[] }', () => {
    const schema = schemas.ObservabilityConflict;
    assert.ok(schema, 'ObservabilityConflict should exist');
    assert.equal(schema.properties.error.type, 'array');
    assert.equal(
      schema.properties.references.items.$ref,
      '#/components/schemas/ObservabilityConflictReference'
    );
    assert.deepEqual(schemas.ObservabilityConflictReference.required, ['uid', 'name']);
    assert.deepEqual(schema.required, ['error']);
  });

  it('destination conflicts show the { error, references } body with the blocking pipelines', () => {
    for (const verb of ['put', 'delete']) {
      const media = response('/v2/observability/destinations/{uid}', verb, '409').content['application/json'];
      const withRefs = examplesOf(media).filter((e) => e.references);
      assert.ok(withRefs.length > 0, `${verb} 409 should have an example with references`);
      for (const example of withRefs) {
        assert.ok(Array.isArray(example.error));
        for (const ref of example.references) assert.deepEqual(Object.keys(ref), ['uid', 'name']);
      }
    }
  });

  it('ObservabilityValidationFailed wraps ValidationFailed in error (backend sends { error: [...] })', () => {
    const schema = schemas.ObservabilityValidationFailed;
    assert.ok(schema, 'ObservabilityValidationFailed should exist');
    assert.equal(schema.properties.error.$ref, '#/components/schemas/ValidationFailed');
  });
});

describe('Observability destination schema', () => {
  const dest = schemas.ObservabilityDestination;

  it('documents redacted, write-only secrets that cannot be recovered', () => {
    assert.match(dest.description, /write-only/);
    assert.match(dest.description, /`""` means "set but hidden"/);
    assert.match(dest.description, /cannot be recovered/);
    assert.match(dest.description, /re-entered with its real value when the endpoint origin \(scheme, host or port\) changes/);
  });

  it('the GET example returns stored secrets as ""', () => {
    const media = response('/v2/observability/destinations/{uid}', 'get', '200').content['application/json'];
    const http = media.examples.redactedHttp.value;
    assert.equal(http.auth.token, '');
    assert.equal(http.tls.keyPem, '');
    assert.equal(http.headers['X-Scope-OrgID'], '');
    assert.equal(media.examples.redactedSplunk.value.splunk.token, '');
  });

  // otelDestination yup: endpoint must be an https:// URL (http:// is rejected)
  it('endpoint must be https', () => {
    assert.match(dest.properties.endpoint.description, /Absolute `https:\/\/` URL/);
    assert.doesNotMatch(dest.properties.endpoint.description, /`http:\/\/`/);
  });

  it('type is http (OTLP/HTTP) or splunk (Splunk HEC)', () => {
    assert.deepEqual(dest.properties.type.enum, ['splunk', 'http']);
    assert.match(dest.properties.type.description, /`http`: OTLP\/HTTP/);
    assert.match(dest.properties.type.description, /`splunk`: Splunk HEC/);
  });

  it('expresses limits and enums as schema keywords', () => {
    const p = dest.properties;
    assert.equal(p.name.maxLength, 100);
    assert.equal(p.headers.maxProperties, 50);
    assert.equal(p.accepts.minItems, 1);
    assert.equal(p.accepts.uniqueItems, true);
    assert.deepEqual(p.encoding.enum, ['proto', 'json']);
    assert.deepEqual(p.compression.enum, ['gzip', 'zstd', 'zlib', 'none']);
    assert.equal(p.timeoutSeconds.minimum, 1);
    assert.equal(p.readBufferSize.minimum, 0);
    assert.equal(p.writeBufferSize.maximum, 2147483647);
    assert.deepEqual(schemas.ObservabilityDestinationAuth.properties.type.enum, ['none', 'bearer', 'basic']);
  });

  it('does not promise collector defaults the portal does not set', () => {
    for (const field of ['timeoutSeconds', 'readBufferSize', 'writeBufferSize']) {
      assert.doesNotMatch(dest.properties[field].description, /default of \d/);
    }
  });

  it('tls.keyPem is kept only while certPem and the endpoint origin are unchanged', () => {
    assert.match(schemas.ObservabilityDestinationTLS.properties.keyPem.description, /certPem` and the endpoint origin are unchanged/);
  });
});

describe('Observability pipeline schema', () => {
  const pipe = schemas.ObservabilityPipeline;

  it('uid is optional on create, must be a UUID and is org-scoped', () => {
    for (const name of ['ObservabilityDestination', 'ObservabilityPipeline']) {
      const schema = schemas[name];
      assert.ok(!schema.required.includes('uid'), `${name}.uid should not be required`);
      assert.match(schema.properties.uid.description, /must be a UUID/);
      assert.match(schema.properties.uid.description, /scoped to the organization/);
      assert.match(schema.properties.uid.description, /returns 409/);
    }
  });

  it('expresses limits as schema keywords', () => {
    const p = pipe.properties;
    assert.equal(p.destinationUids.minItems, 1);
    assert.equal(p.destinationUids.maxItems, 50);
    assert.equal(p.attributes.maxItems, 200);
    assert.equal(p.constants.maxProperties, 50);
    const tagMatches = schemas.ObservabilitySelector.properties.tagMatches;
    assert.equal(tagMatches.maxProperties, 50);
    assert.equal(tagMatches.additionalProperties.maxItems, 100);
    assert.equal(tagMatches.additionalProperties.items.maxLength, 256);
  });

  it('ObservabilitySignal is metrics or logs', () => {
    assert.deepEqual(schemas.ObservabilitySignal.enum, ['metrics', 'logs']);
    assert.equal(pipe.properties.kind.$ref, '#/components/schemas/ObservabilitySignal');
  });

  it('tagMatches values are lists of strings', () => {
    assert.equal(schemas.ObservabilitySelector.properties.tagMatches.additionalProperties.type, 'array');
  });

  it('lifecycleStates includes unset for nodes without a lifecycle state', () => {
    const states = schemas.ObservabilitySelector.properties.lifecycleStates;
    assert.deepEqual(states.items.enum, ['pre-production', 'production', 'maintenance', 'decommissioned', 'unset']);
    assert.match(states.description, /`unset` selects nodes that have no lifecycle state/);
  });

  it('matchMode is all or any and defaults to all', () => {
    const matchMode = schemas.ObservabilitySelector.properties.matchMode;
    assert.deepEqual(matchMode.enum, ['all', 'any']);
    assert.match(matchMode.description, /Defaults to `all`/);
  });

  it('attributes carry id, emitAs and promoteToMetricLabel', () => {
    const attr = schemas.ObservabilityAttributeSelection;
    assert.deepEqual(Object.keys(attr.properties), ['id', 'emitAs', 'promoteToMetricLabel']);
    assert.deepEqual(attr.required, ['id']);
    assert.equal(attr.properties.emitAs.maxLength, 128);
    assert.equal(attr.properties.emitAs.pattern, '^[A-Za-z][A-Za-z0-9_.]*$');
  });

  // data/OtelNames.ts RESERVED_EMITTED_NAMES
  it('lists every reserved emitted name', () => {
    const reserved = [
      'nodeID', 'nodeName', 'orgID', 'dataType', 'host.name', 'timestamp', 'eventType', 'state',
      'category', 'itemType', 'itemID', 'auditType', 'ip', 'userName', 'interface', 'network',
      'service.name', 'service.version', 'tg.lifecycle', 'routeKey', 'tg.internal.',
    ];
    for (const text of [pipe.properties.constants.description, schemas.ObservabilityAttributeSelection.properties.emitAs.description]) {
      for (const name of reserved) assert.ok(text.includes(`\`${name}\``), `${name} should be listed as reserved`);
    }
  });

  it('logs sources carry includeOrgLevel, events, changes and audits; enabled is not required', () => {
    const logs = schemas.ObservabilityLogSources;
    assert.deepEqual(Object.keys(logs.properties), ['includeOrgLevel', 'events', 'changes', 'audits']);
    assert.match(logs.properties.includeOrgLevel.description, /omitted means true/);
    assert.equal(schemas.ObservabilityLogSource.required, undefined);
    assert.equal(schemas.ObservabilityEventSource.required, undefined);
    assert.deepEqual(schemas.ObservabilitySeverity.enum, ['INFO', 'WARNING', 'ERROR', 'CRITICAL']);
  });
});

describe('Observability attribute catalog', () => {
  // ObservabilityPipelineController maps each entry to exactly these fields
  it('entries are { id, label, emitAs, type, promotable } with no source metadata', () => {
    const entry = schemas.ObservabilityCatalogEntry;
    assert.deepEqual(Object.keys(entry.properties), ['id', 'label', 'emitAs', 'type', 'promotable']);
    assert.deepEqual(entry.required, ['id', 'label', 'emitAs', 'type', 'promotable']);
    assert.equal(entry.properties.source, undefined);
  });

  it('describes the tag.<name> entries', () => {
    const description = op('/v2/observability/attribute-catalog', 'get').description;
    assert.match(description, /`tg\.tag\.<name>`/);
    assert.match(description, /`promotable` set to true/);
  });
});

describe('Observability schema references', () => {
  it('every $ref under an Observability component resolves', () => {
    const observability = (section) =>
      Object.entries(spec.components[section] ?? {}).filter(([name]) => /^observability/i.test(name));
    const refs = JSON.stringify([
      ...observability('schemas'),
      ...observability('responses'),
      ...observability('requestBodies'),
      ...observability('parameters'),
    ]).match(/#\/components\/\w+\/\w+/g);
    for (const ref of refs) deref({ $ref: ref });
  });
});
