/**
 * Tests for the lifecycle-state endpoint and LifecycleStateRequest schema
 * Validates that the spec matches the actual backend implementation
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

describe('Lifecycle State Path Definition', () => {
  const pathKey = '/v2/node/{nodeID}/lifecycle-state';
  const pathDef = spec.paths?.[pathKey];

  it('path definition exists in index.yaml', () => {
    assert.ok(pathDef, `Path ${pathKey} should exist in paths`);
  });

  it('uses $ref: "#/components/parameters/nodeID"', () => {
    assert.ok(pathDef, `Path ${pathKey} must exist`);
    assert.ok(pathDef.parameters, 'Path should have parameters');
    const nodeIDRef = pathDef.parameters.find(
      (p) => p.$ref === '#/components/parameters/nodeID'
    );
    assert.ok(nodeIDRef, 'Should reference nodeID parameter');
  });

  it('does NOT have GET operation (backend has no GET handler)', () => {
    assert.ok(pathDef, `Path ${pathKey} must exist`);
    assert.ok(!pathDef.get, 'Path should NOT have GET operation - backend does not implement it');
  });

  it('has PUT operation', () => {
    assert.ok(pathDef, `Path ${pathKey} must exist`);
    assert.ok(pathDef.put, 'Path should have PUT operation');
  });

  it('PUT has correct summary', () => {
    assert.ok(pathDef?.put, `Path ${pathKey} with PUT operation must exist`);
    assert.equal(
      pathDef.put.summary,
      'Update the lifecycle state of a specific node',
      'PUT summary should match expected value'
    );
  });

  it('PUT description includes permission documentation with --- separator', () => {
    assert.ok(pathDef?.put, `Path ${pathKey} with PUT operation must exist`);
    const description = pathDef.put.description;
    assert.ok(description, 'PUT should have description');
    assert.ok(
      description.includes('---'),
      'Description should contain --- separator'
    );
    assert.ok(
      description.includes('permission') || description.includes('Requires'),
      'Description should document permissions'
    );
  });

  it('has tags: Appliance, Agent', () => {
    assert.ok(pathDef?.put, `Path ${pathKey} with PUT operation must exist`);
    const tags = pathDef.put.tags;
    assert.ok(tags, 'PUT should have tags');
    assert.ok(tags.includes('Appliance'), 'Tags should include Appliance');
    assert.ok(tags.includes('Agent'), 'Tags should include Agent');
  });

  it('is placed after other /v2/node/{nodeID}/* endpoints', () => {
    assert.ok(spec.paths, 'spec.paths must exist');
    const pathKeys = Object.keys(spec.paths);
    const lifecycleIndex = pathKeys.indexOf(pathKey);
    assert.ok(lifecycleIndex >= 0, `Path ${pathKey} must exist in paths`);
    
    // Find all /v2/node/{nodeID}/ paths
    const v2NodePaths = pathKeys.filter(
      (p) => p.startsWith('/v2/node/{nodeID}/') && p !== pathKey
    );
    
    // All other /v2/node/{nodeID}/ paths should come before lifecycle-state
    for (const otherPath of v2NodePaths) {
      const otherIndex = pathKeys.indexOf(otherPath);
      assert.ok(
        otherIndex < lifecycleIndex,
        `${otherPath} (index ${otherIndex}) should be before lifecycle-state (index ${lifecycleIndex})`
      );
    }
  });
});

describe('LifecycleStateRequest Schema', () => {
  const schema = spec.components?.schemas?.LifecycleStateRequest;

  it('LifecycleStateRequest schema exists in components/schemas', () => {
    assert.ok(schema, 'LifecycleStateRequest schema should exist');
  });

  it('lifecycleState property is string enum with correct values matching backend', () => {
    assert.ok(schema, 'LifecycleStateRequest schema must exist');
    const lifecycleStateProperty = schema.properties?.lifecycleState;
    assert.ok(lifecycleStateProperty, 'lifecycleState property should exist');
    assert.equal(lifecycleStateProperty.type, 'string', 'lifecycleState should be type string');
    assert.ok(lifecycleStateProperty.enum, 'lifecycleState should have enum');
    
    // These values match the backend validation in Node.ts updateLifecycleState()
    const expectedStates = ['pre-production', 'production', 'maintenance', 'decommissioned'];
    assert.deepEqual(
      lifecycleStateProperty.enum.sort(),
      expectedStates.sort(),
      'lifecycleState enum should match backend validation values'
    );
  });

  it('does NOT have phase property (not in backend)', () => {
    assert.ok(schema?.properties, 'LifecycleStateRequest schema with properties must exist');
    assert.ok(!schema.properties.phase, 'phase property should NOT exist - not in backend');
  });

  it('does NOT have lastTransition property (not in backend)', () => {
    assert.ok(schema?.properties, 'LifecycleStateRequest schema with properties must exist');
    assert.ok(!schema.properties.lastTransition, 'lastTransition property should NOT exist - not in backend');
  });

  it('does NOT have message property (not in backend)', () => {
    assert.ok(schema?.properties, 'LifecycleStateRequest schema with properties must exist');
    assert.ok(!schema.properties.message, 'message property should NOT exist - not in backend');
  });

  it('lifecycleState is required', () => {
    assert.ok(schema, 'LifecycleStateRequest schema must exist');
    const required = schema.required;
    assert.ok(required, 'Schema should have required array');
    assert.ok(required.includes('lifecycleState'), 'lifecycleState should be required');
  });

  it('example value is included', () => {
    assert.ok(schema?.properties, 'LifecycleStateRequest schema with properties must exist');
    const lifecycleStateProperty = schema.properties.lifecycleState;
    assert.ok(lifecycleStateProperty?.example !== undefined, 'lifecycleState should have example value');
  });
});

describe('PUT Responses', () => {
  const pathKey = '/v2/node/{nodeID}/lifecycle-state';
  const responses = spec.paths?.[pathKey]?.put?.responses;

  it('has responses defined', () => {
    assert.ok(responses, 'PUT operation should have responses');
  });

  it('200 OK response exists with no body (matches backend OK(res))', () => {
    assert.ok(responses, 'PUT responses must exist');
    assert.ok(responses['200'], '200 response should exist');
    assert.equal(responses['200'].description, 'OK', '200 response description should be "OK"');
    // Backend returns OK(res) with no body, so no content should be defined
    assert.ok(!responses['200'].content, '200 response should NOT have content - backend returns no body');
  });

  it('404 Not Found response exists', () => {
    assert.ok(responses, 'PUT responses must exist');
    assert.ok(responses['404'], '404 response should exist');
    const description = responses['404'].description?.toLowerCase();
    assert.ok(description, '404 response should have a description');
    assert.ok(
      description.includes('not found'),
      '404 response description should indicate "not found"'
    );
  });

  it('422 Validation error response exists (UI handles this)', () => {
    assert.ok(responses, 'PUT responses must exist');
    assert.ok(responses['422'], '422 response should exist - UI handles 422 for validation errors');
    const description = responses['422'].description?.toLowerCase();
    assert.ok(description, '422 response should have a description');
    assert.ok(
      description.includes('validation'),
      '422 response description should indicate validation error'
    );
  });

  it('422 response references ValidationFailed schema', () => {
    assert.ok(responses?.['422'], '422 response must exist');
    const content = responses['422'].content;
    assert.ok(content, '422 response should have content');
    assert.ok(content['application/json'], '422 response should have application/json content type');
    
    const schemaRef = content['application/json'].schema?.$ref;
    assert.equal(
      schemaRef,
      '#/components/schemas/ValidationFailed',
      '422 response should reference ValidationFailed schema'
    );
  });
});

describe('Request Body', () => {
  const pathKey = '/v2/node/{nodeID}/lifecycle-state';
  const requestBody = spec.paths?.[pathKey]?.put?.requestBody;

  it('has requestBody defined', () => {
    assert.ok(requestBody, 'PUT operation should have requestBody');
  });

  it('requestBody references LifecycleStateRequest schema', () => {
    assert.ok(requestBody, 'requestBody must exist');
    const content = requestBody.content;
    assert.ok(content, 'requestBody should have content');
    assert.ok(content['application/json'], 'requestBody should have application/json content type');
    
    const schemaRef = content['application/json'].schema?.$ref;
    assert.equal(
      schemaRef,
      '#/components/schemas/LifecycleStateRequest',
      'requestBody should reference LifecycleStateRequest schema'
    );
  });

  it('requestBody is required', () => {
    assert.ok(requestBody, 'requestBody must exist');
    assert.equal(requestBody.required, true, 'requestBody should be required');
  });
});
