/**
 * Tests for the observability troubleshooting API (WOR-13071): destination tests and pipeline checks
 * Validates that the spec matches the portal backend
 * (ObservabilityTroubleshootingController, OtelDestination.resolve, OtelDestinationTest,
 * OtelActivityPublisher, OtelPipelineCheck)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derefIn, validatorFor } from './helpers/openapi-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, '..', 'index.yaml');
const spec = parse(readFileSync(specPath, 'utf8'));

const DRAFT_TEST = '/v2/observability/destinations/test';
const SAVED_TEST = '/v2/observability/destinations/{uid}/test';
const PIPELINE_CHECK = '/v2/observability/pipelines/{uid}/check';

const READ = 'observability::read';
const MODIFY = 'observability::modify';

// [path, operationId, permission, tag]; all three routes are POST behind JWT + FeatureCheck + PermissionCheck
const OPERATIONS = [
  [DRAFT_TEST, 'testObservabilityDestinationDraft', MODIFY, 'ObservabilityDestination'],
  [SAVED_TEST, 'testObservabilityDestination', MODIFY, 'ObservabilityDestination'],
  [PIPELINE_CHECK, 'checkObservabilityPipeline', READ, 'ObservabilityPipeline'],
];
const TESTS = [DRAFT_TEST, SAVED_TEST];

const schemas = spec.components.schemas;
const op = (path) => spec.paths?.[path]?.post;

const deref = derefIn(spec);
const validate = validatorFor(spec);

const response = (path, code) => deref(op(path)?.responses?.[code]);
const jsonMedia = (path, code) => response(path, code)?.content?.['application/json'];
const namedExamples = (media) => [
  ...(media?.example === undefined ? [] : [['example', media.example]]),
  ...Object.entries(media?.examples ?? {}).map(([name, e]) => [name, deref(e).value]),
];

describe('Validator self-check', () => {
  it('rejects a result with an unknown activityStatus and an unknown property', () => {
    const errors = validate(
      { $ref: '#/components/schemas/ObservabilityDestinationTestResult' },
      { signal: 'logs', ok: true, durationMs: 1, message: 'x', activityStatus: 'queued', extra: 1 }
    );
    assert.equal(errors.length, 2, errors.join('; '));
  });

  it('accepts a destination plus signals for the draft schema', () => {
    const errors = validate(
      { $ref: '#/components/schemas/ObservabilityDestinationTestDraft' },
      { name: 'A', type: 'http', accepts: ['logs'], endpoint: 'https://a.example.com', signals: ['logs'] }
    );
    assert.deepEqual(errors, []);
  });
});

describe('Observability troubleshooting operations', () => {
  const allOperationIds = Object.values(spec.paths).flatMap((item) =>
    Object.values(item).map((o) => o?.operationId).filter(Boolean)
  );

  for (const [path, operationId, permission, tag] of OPERATIONS) {
    describe(`POST ${path}`, () => {
      it('is defined', () => {
        assert.ok(op(path), `post ${path} should exist`);
      });

      it(`has the unique operationId ${operationId}`, () => {
        assert.equal(op(path)?.operationId, operationId);
        assert.equal(allOperationIds.filter((id) => id === operationId).length, 1);
      });

      it(`is tagged ${tag}`, () => {
        assert.deepEqual(op(path)?.tags, [tag]);
      });

      it(`documents ${permission} and the observability feature flag after the --- separator`, () => {
        const description = op(path)?.description;
        assert.ok(description, 'description should exist');
        const parts = description.split('\n\n---\n\n');
        assert.equal(parts.length, 2, 'description should have exactly one --- separator');
        assert.ok(parts[1].includes(`\`${permission}\``), `should require ${permission}`);
        assert.ok(parts[1].includes('`observability` feature'), 'should require the observability feature');
      });

      // PermissionCheck / FeatureCheck answer with res.end("Permission denied" | "Feature not enabled")
      it('uses the shared plain-text ObservabilityForbidden 403', () => {
        assert.equal(op(path)?.responses?.['403']?.$ref, '#/components/responses/ObservabilityForbidden');
      });

      it('uses the shared HTML 400 for malformed JSON', () => {
        assert.equal(op(path)?.responses?.['400']?.$ref, '#/components/responses/ObservabilityMalformedJSON');
      });

      it('has a 422 validation response with ObservabilityValidationFailed', () => {
        const res = response(path, '422');
        assert.ok(res, '422 should exist');
        assert.ok(res.description.toLowerCase().includes('validation'));
        assert.equal(jsonMedia(path, '422')?.schema?.$ref, '#/components/schemas/ObservabilityValidationFailed');
      });

      it('has a 404 not found response', () => {
        const res = response(path, '404');
        assert.ok(res, '404 should exist');
        assert.ok(res.description.toLowerCase().includes('not found'));
        assert.equal(jsonMedia(path, '404')?.schema?.$ref, '#/components/schemas/ObservabilityNotFound');
      });
    });
  }

  it('places the literal /destinations/test before /destinations/{uid}', () => {
    const paths = Object.keys(spec.paths);
    const index = (p) => paths.indexOf(p);
    assert.ok(index(DRAFT_TEST) > index('/v2/observability/destinations'));
    assert.ok(index(DRAFT_TEST) < index('/v2/observability/destinations/{uid}'));
    assert.ok(index(SAVED_TEST) === index('/v2/observability/destinations/{uid}') + 1);
    assert.ok(index(PIPELINE_CHECK) === index('/v2/observability/pipelines/{uid}') + 1);
    assert.ok(index(PIPELINE_CHECK) < index('/v2/observability/pipelines/{uid}/disable'));
  });

  it('uses the shared uid path parameters', () => {
    assert.deepEqual(op(SAVED_TEST).parameters, [{ $ref: '#/components/parameters/observabilityDestinationUid' }]);
    assert.deepEqual(op(PIPELINE_CHECK).parameters, [{ $ref: '#/components/parameters/observabilityPipelineUid' }]);
    assert.equal(op(DRAFT_TEST).parameters, undefined, 'the draft route has no path parameter');
  });

  it('uses the destination and pipeline 404 responses', () => {
    assert.equal(op(DRAFT_TEST).responses['404'].$ref, '#/components/responses/ObservabilityDestinationNotFound');
    assert.equal(op(SAVED_TEST).responses['404'].$ref, '#/components/responses/ObservabilityDestinationNotFound');
    assert.equal(op(PIPELINE_CHECK).responses['404'].$ref, '#/components/responses/ObservabilityPipelineNotFound');
  });
});

describe('Destination test request bodies', () => {
  it('draft body is a required ObservabilityDestination plus signals', () => {
    const body = op(DRAFT_TEST).requestBody;
    assert.equal(body.required, true);
    assert.equal(body.content['application/json'].schema.$ref, '#/components/schemas/ObservabilityDestinationTestDraft');
    assert.deepEqual(schemas.ObservabilityDestinationTestDraft.allOf, [
      { $ref: '#/components/schemas/ObservabilityDestination' },
      { $ref: '#/components/schemas/ObservabilityDestinationTestOptions' },
    ]);
  });

  // bodyOf(req) treats a missing body as {}; signals defaults to every accepted signal
  it('saved test body is optional and holds only signals', () => {
    const body = op(SAVED_TEST).requestBody;
    assert.equal(body.required, false);
    assert.equal(body.content['application/json'].schema.$ref, '#/components/schemas/ObservabilityDestinationTestOptions');
    assert.deepEqual(Object.keys(schemas.ObservabilityDestinationTestOptions.properties), ['signals']);
  });

  // signalsToTest: null/undefined -> accepts; otherwise a non-empty array of strings
  it('signals is a nullable non-empty list of ObservabilitySignal', () => {
    const signals = schemas.ObservabilityDestinationTestSignals;
    assert.equal(signals.type, 'array');
    assert.equal(signals.nullable, true);
    assert.equal(signals.minItems, 1);
    assert.equal(signals.items.$ref, '#/components/schemas/ObservabilitySignal');
  });

  it('the draft description explains uid secret reuse and the missing activity without uid', () => {
    const description = op(DRAFT_TEST).description;
    assert.ok(description.includes('Nothing is saved'));
    assert.ok(description.includes('re-entering every secret'));
    assert.ok(description.includes('`activityStatus` is always `unavailable`'));
  });

  it('examples cover a draft without uid and a draft with uid that reuses stored secrets', () => {
    const examples = op(DRAFT_TEST).requestBody.content['application/json'].examples;
    assert.ok(Object.values(examples).some((e) => e.value.uid === undefined));
    const withUid = Object.values(examples).find((e) => e.value.uid);
    assert.ok(withUid, 'a draft example with uid should exist');
    assert.equal(withUid.value.auth.token, '', 'the stored bearer token should be reused');
    const saved = op(SAVED_TEST).requestBody.content['application/json'].examples;
    assert.ok(Object.values(saved).some((e) => Array.isArray(e.value.signals)), 'a saved example with signals should exist');
  });
});

describe('Destination test results', () => {
  const result = schemas.ObservabilityDestinationTestResult;

  it('both test routes return ObservabilityDestinationTestResponse', () => {
    for (const path of TESTS) {
      assert.equal(jsonMedia(path, '200')?.schema?.$ref, '#/components/schemas/ObservabilityDestinationTestResponse');
    }
    assert.equal(
      schemas.ObservabilityDestinationTestResponse.properties.results.items.$ref,
      '#/components/schemas/ObservabilityDestinationTestResult'
    );
  });

  // OtelTestResult + activityStatus from the controller
  it('a result has signal, ok, status, durationMs, message, response, retryable and activityStatus', () => {
    assert.deepEqual(Object.keys(result.properties).sort(), [
      'activityStatus', 'durationMs', 'message', 'ok', 'response', 'retryable', 'signal', 'status',
    ]);
    assert.deepEqual(result.required.sort(), ['activityStatus', 'durationMs', 'message', 'ok', 'signal']);
    assert.equal(result.properties.signal.$ref, '#/components/schemas/ObservabilitySignal');
    assert.equal(result.properties.response.maxLength, 300, 'RESPONSE_SNIPPET_LENGTH is 300');
    assert.deepEqual(result.properties.retryable.enum, [true], 'retryable is only ever true');
  });

  // ActivityPublishStatus in OtelActivityPublisher
  it('activityStatus is recorded, pending, disabled or unavailable', () => {
    assert.equal(result.properties.activityStatus.$ref, '#/components/schemas/ObservabilityDestinationTestActivityStatus');
    const status = schemas.ObservabilityDestinationTestActivityStatus;
    assert.deepEqual(status.enum, ['recorded', 'pending', 'disabled', 'unavailable']);
    for (const value of status.enum) assert.ok(status.description.includes(`\`${value}\``), `${value} should be described`);
    assert.ok(status.description.includes('`destination_test`'), 'should name the activity category');
  });

  it('examples show every activityStatus value', () => {
    const seen = new Set(
      TESTS.flatMap((path) => namedExamples(jsonMedia(path, '200'))).flatMap(([, v]) => v.results.map((r) => r.activityStatus))
    );
    assert.deepEqual([...seen].sort(), ['disabled', 'pending', 'recorded', 'unavailable']);
  });

  // A refused endpoint is a 200 with ok:false, not an HTTP error
  it('the draft examples show a blocked endpoint as ok:false with activityStatus unavailable', () => {
    const blocked = namedExamples(jsonMedia(DRAFT_TEST, '200'))
      .flatMap(([, v]) => v.results)
      .filter((r) => r.message.startsWith('The portal will not send to this endpoint: '));
    assert.ok(blocked.length > 0, 'a blocked example should exist');
    for (const r of blocked) {
      assert.equal(r.ok, false);
      assert.equal(r.status, undefined);
      assert.equal(r.activityStatus, 'unavailable');
    }
  });

  it('the saved test description covers SSRF protection, redirects and the time budget', () => {
    const description = op(SAVED_TEST).description;
    for (const text of ['`https://`', '169.254.169.254', '100.100.100.200', 'fd00:ec2::254', 'Redirects are not followed', '/v1/logs', '24 seconds', 'trustgrid.test']) {
      assert.ok(description.includes(text), `should mention ${text}`);
    }
  });
});

describe('Destination test limits', () => {
  for (const path of TESTS) {
    it(`${path} uses the shared 429 and 503 responses`, () => {
      assert.equal(op(path).responses['429'].$ref, '#/components/responses/ObservabilityTestTooManyRequests');
      assert.equal(op(path).responses['503'].$ref, '#/components/responses/ObservabilityTestUnavailable');
    });
  }

  it('429 declares an integer Retry-After header sent only for the rate limit', () => {
    const res = spec.components.responses.ObservabilityTestTooManyRequests;
    const header = res.headers?.['Retry-After'];
    assert.ok(header, 'Retry-After should be declared');
    assert.equal(header.schema.type, 'integer');
    assert.equal(header.schema.minimum, 1);
    assert.ok(header.description.includes('only'), 'should say when it is sent');
  });

  it('429 has the rate-limit and concurrency bodies', () => {
    const res = spec.components.responses.ObservabilityTestTooManyRequests;
    const media = res.content['application/json'];
    assert.equal(media.schema.$ref, '#/components/schemas/ObservabilityErrors');
    const messages = namedExamples(media).flatMap(([, v]) => v.error);
    assert.deepEqual(messages.sort(), [
      'another test for this org is still running; try again when it finishes',
      'too many test requests, try again in a minute',
    ]);
    assert.ok(res.description.includes('2 tests'));
    assert.ok(res.description.includes('10 test requests'));
  });

  it('503 is the JSON rate-limit-store failure body', () => {
    const media = spec.components.responses.ObservabilityTestUnavailable.content['application/json'];
    assert.equal(media.schema.$ref, '#/components/schemas/ObservabilityErrors');
    assert.deepEqual(media.example, { error: ['tests are unavailable right now, try again shortly'] });
  });
});

describe('Pipeline check', () => {
  it('body is optional with an optional nullable record', () => {
    const body = op(PIPELINE_CHECK).requestBody;
    assert.equal(body.required, false);
    assert.equal(body.content['application/json'].schema.$ref, '#/components/schemas/ObservabilityPipelineCheckRequest');
    assert.equal(schemas.ObservabilityPipelineCheckRequest.required, undefined);
    assert.equal(schemas.ObservabilityPipelineCheckRecord.nullable, true);
  });

  // parseCheckRecord in OtelPipelineCheck
  it('record has source, nodeId, eventType and level', () => {
    const record = schemas.ObservabilityPipelineCheckRecord;
    assert.deepEqual(record.required, ['source']);
    assert.deepEqual(record.properties.source.enum, ['metrics', 'events', 'changes', 'audits']);
    assert.equal(record.properties.nodeId.maxLength, 128);
    assert.equal(record.properties.eventType.maxLength, 128);
    assert.deepEqual(record.properties.level.enum, ['INFO', 'WARNING', 'ERROR', 'CRITICAL']);
  });

  it('returns ObservabilityPipelineCheckResult with verdict, checks and destinations', () => {
    assert.equal(jsonMedia(PIPELINE_CHECK, '200')?.schema?.$ref, '#/components/schemas/ObservabilityPipelineCheckResult');
    const result = schemas.ObservabilityPipelineCheckResult;
    assert.deepEqual(result.required, ['verdict', 'checks', 'destinations']);
    assert.deepEqual(result.properties.verdict.enum, ['ok', 'skipped', 'delivered', 'dropped', 'unknown']);
    assert.deepEqual(result.properties.destinations.required, ['total', 'usable']);
  });

  it('a check item has id, group, label, status and detail', () => {
    const check = schemas.ObservabilityPipelineCheckItem;
    assert.deepEqual(check.required, ['id', 'group', 'label', 'status', 'detail']);
    assert.deepEqual(check.properties.group.enum, ['pipeline', 'record']);
    assert.deepEqual(check.properties.status.enum, ['pass', 'fail', 'warning', 'skipped', 'info']);
  });

  it('examples show delivered and dropped verdicts', () => {
    const verdicts = namedExamples(jsonMedia(PIPELINE_CHECK, '200')).map(([, v]) => v.verdict);
    assert.ok(verdicts.includes('delivered'));
    assert.ok(verdicts.includes('dropped'));
  });

  // the timing note is added only when the verdict is delivered
  it('only delivered examples carry the record.timing info check', () => {
    for (const [name, v] of namedExamples(jsonMedia(PIPELINE_CHECK, '200'))) {
      const timing = v.checks.some((c) => c.id === 'record.timing');
      assert.equal(timing, v.verdict === 'delivered', `${name}`);
    }
  });

  it('says the check is not proof of delivery and that nodes::read is not required', () => {
    const description = op(PIPELINE_CHECK).description;
    assert.ok(description.includes('not proof that real telemetry reached a destination'));
    assert.ok(description.includes('`nodes::read`'));
    assert.ok(description.includes('without DNS'));
  });
});

describe('Examples validate against their schemas', () => {
  for (const [path] of OPERATIONS) {
    const operation = op(path);
    const body = deref(operation?.requestBody);
    for (const [type, media] of Object.entries(body?.content ?? {})) {
      for (const [name, value] of namedExamples(media)) {
        it(`${path} request ${type} example ${name}`, () => {
          assert.deepEqual(validate(media.schema, value), []);
        });
      }
    }
    for (const [code, raw] of Object.entries(operation?.responses ?? {})) {
      for (const [type, media] of Object.entries(deref(raw).content ?? {})) {
        for (const [name, value] of namedExamples(media)) {
          it(`${path} ${code} ${type} example ${name}`, () => {
            assert.deepEqual(validate(media.schema, value), []);
          });
        }
      }
    }
  }
});
