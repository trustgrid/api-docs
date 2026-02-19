/**
 * Tests for the lifecycle-state endpoint and LifecycleState schema
 * Validates acceptance criteria for US-001, US-002, US-003
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

describe('US-001: Lifecycle State Path Definition', () => {
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

  it('has GET operation', () => {
    assert.ok(pathDef, `Path ${pathKey} must exist`);
    assert.ok(pathDef.get, 'Path should have GET operation');
  });

  it('GET has correct summary', () => {
    assert.ok(pathDef?.get, `Path ${pathKey} with GET operation must exist`);
    assert.equal(
      pathDef.get.summary,
      'Retrieve the current lifecycle state of a specific node',
      'GET summary should match expected value'
    );
  });

  it('description includes permission documentation with --- separator', () => {
    assert.ok(pathDef?.get, `Path ${pathKey} with GET operation must exist`);
    const description = pathDef.get.description;
    assert.ok(description, 'GET should have description');
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
    assert.ok(pathDef?.get, `Path ${pathKey} with GET operation must exist`);
    const tags = pathDef.get.tags;
    assert.ok(tags, 'GET should have tags');
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

describe('US-002: LifecycleState Schema', () => {
  const schema = spec.components?.schemas?.LifecycleState;

  it('LifecycleState schema exists in components/schemas', () => {
    assert.ok(schema, 'LifecycleState schema should exist');
  });

  it('state property is string enum with correct values', () => {
    assert.ok(schema, 'LifecycleState schema must exist');
    const stateProperty = schema.properties?.state;
    assert.ok(stateProperty, 'state property should exist');
    assert.equal(stateProperty.type, 'string', 'state should be type string');
    assert.ok(stateProperty.enum, 'state should have enum');
    
    const expectedStates = ['active', 'inactive', 'provisioning', 'decommissioning', 'decommissioned'];
    assert.deepEqual(
      stateProperty.enum.sort(),
      expectedStates.sort(),
      'state enum should have all expected values'
    );
  });

  it('phase property is string', () => {
    assert.ok(schema?.properties, 'LifecycleState schema with properties must exist');
    const phaseProperty = schema.properties.phase;
    assert.ok(phaseProperty, 'phase property should exist');
    assert.equal(phaseProperty.type, 'string', 'phase should be type string');
  });

  it('lastTransition property is string with date-time format', () => {
    assert.ok(schema?.properties, 'LifecycleState schema with properties must exist');
    const lastTransitionProperty = schema.properties.lastTransition;
    assert.ok(lastTransitionProperty, 'lastTransition property should exist');
    assert.equal(lastTransitionProperty.type, 'string', 'lastTransition should be type string');
    assert.equal(lastTransitionProperty.format, 'date-time', 'lastTransition should have date-time format');
  });

  it('message property is string (optional)', () => {
    assert.ok(schema?.properties, 'LifecycleState schema with properties must exist');
    const messageProperty = schema.properties.message;
    assert.ok(messageProperty, 'message property should exist');
    assert.equal(messageProperty.type, 'string', 'message should be type string');
    
    // Verify message is NOT in required (it's optional)
    const required = schema.required || [];
    assert.ok(
      !required.includes('message'),
      'message should NOT be in required array (it is optional)'
    );
  });

  it('state is required', () => {
    assert.ok(schema, 'LifecycleState schema must exist');
    const required = schema.required;
    assert.ok(required, 'Schema should have required array');
    assert.ok(required.includes('state'), 'state should be required');
  });

  it('example values are included', () => {
    assert.ok(schema?.properties, 'LifecycleState schema with properties must exist');
    // Check for example values in properties
    const properties = schema.properties;
    
    // At least state should have an example
    const stateHasExample = properties.state?.example !== undefined;
    const phaseHasExample = properties.phase?.example !== undefined;
    const lastTransitionHasExample = properties.lastTransition?.example !== undefined;
    const messageHasExample = properties.message?.example !== undefined;
    
    const hasExamples = stateHasExample || phaseHasExample || lastTransitionHasExample || messageHasExample;
    assert.ok(hasExamples, 'Schema properties should include example values');
  });
});

describe('US-003: Responses', () => {
  const pathKey = '/v2/node/{nodeID}/lifecycle-state';
  const responses = spec.paths?.[pathKey]?.get?.responses;

  it('has responses defined', () => {
    assert.ok(responses, 'GET operation should have responses');
  });

  it('200 OK response exists', () => {
    assert.ok(responses, 'GET responses must exist');
    assert.ok(responses['200'], '200 response should exist');
    assert.equal(responses['200'].description, 'OK', '200 response description should be "OK"');
  });

  it('200 response references LifecycleState schema', () => {
    assert.ok(responses?.['200'], '200 response must exist');
    const content = responses['200'].content;
    assert.ok(content, '200 response should have content');
    assert.ok(content['application/json'], '200 response should have application/json content type');
    
    const schemaRef = content['application/json'].schema?.$ref;
    assert.equal(
      schemaRef,
      '#/components/schemas/LifecycleState',
      '200 response should reference LifecycleState schema'
    );
  });

  it('404 Not Found response exists', () => {
    assert.ok(responses, 'GET responses must exist');
    assert.ok(responses['404'], '404 response should exist');
    // Accept variations like "Not Found" or "Not found"
    const description = responses['404'].description?.toLowerCase();
    assert.ok(description, '404 response should have a description');
    assert.ok(
      description.includes('not found'),
      '404 response description should indicate "not found"'
    );
  });
});
