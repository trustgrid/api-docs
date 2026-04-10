import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, '..', 'index.yaml');
const spec = parse(readFileSync(specPath, 'utf8'));

describe('Container trigger documentation', () => {
  const pathKey = '/node/{nodeID}/trigger/{event}';
  const pathDef = spec.paths?.[pathKey];
  const post = pathDef?.post;

  it('documents the generic trigger path', () => {
    assert.ok(pathDef, `Path ${pathKey} should exist in paths`);
    assert.ok(post, `Path ${pathKey} should have POST operation`);
  });

  it('documents container management use cases in the POST description', () => {
    assert.ok(post?.description, 'POST should have a description');
    assert.match(post.description, /container-status/, 'Description should mention container-status');
    assert.match(post.description, /container-image/, 'Description should mention container-image');
    assert.match(post.description, /cmd_action/, 'Description should mention cmd_action');
    assert.match(post.description, /start/i, 'Description should mention starting a container');
    assert.match(post.description, /stop/i, 'Description should mention stopping a container');
  });

  it('documents container trigger request schemas', () => {
    const schema = post?.requestBody?.content?.['application/json']?.schema;

    assert.equal(schema?.type, 'object');
    assert.equal(schema?.additionalProperties, true);
    assert.match(
      schema?.description ?? '',
      /other event payload objects are also valid/i,
      'Request body should remain generic for non-container trigger payloads'
    );
  });

  it('includes concrete request examples for start, stop, status, image list, and image delete', () => {
    const examples = post?.requestBody?.content?.['application/json']?.examples;

    assert.deepEqual(examples?.startContainer?.value, { cmd_action: 'start' });
    assert.deepEqual(examples?.stopContainer?.value, { cmd_action: 'stop' });
    assert.deepEqual(examples?.containerStatus?.value, { container: 'mycontainer' });
    assert.deepEqual(examples?.listImages?.value, { action: 'list' });
    assert.deepEqual(examples?.deleteImage?.value, {
      action: 'delete',
      image: 'mycontainer/latest'
    });
  });

  it('documents container trigger response schemas', () => {
    const schemaDefs = post?.responses?.['200']?.content?.['application/json']?.schema?.anyOf;
    const schemaRefs = schemaDefs?.filter((entry) => entry.$ref).map((entry) => entry.$ref);
    const hasBooleanResponse = schemaDefs?.some((entry) => entry.type === 'boolean');

    assert.ok(hasBooleanResponse, 'Response schema should allow non-wait boolean response');
    assert.ok(
      schemaRefs.includes('#/components/schemas/NodeTriggerContainerActionResponse'),
      'Response schema should include container action response'
    );
    assert.ok(
      schemaRefs.includes('#/components/schemas/NodeTriggerContainerStatusResponse'),
      'Response schema should include container status response'
    );
    assert.ok(
      schemaRefs.includes('#/components/schemas/NodeTriggerContainerImageListResponse'),
      'Response schema should include container image list response'
    );
    assert.ok(
      schemaRefs.includes('#/components/schemas/NodeTriggerContainerImageDeleteResponse'),
      'Response schema should include container image delete response'
    );
  });
});

describe('Container trigger schemas', () => {
  const schemas = spec.components?.schemas;

  it('defines container action request and response schemas', () => {
    assert.deepEqual(schemas?.NodeTriggerContainerActionRequest?.required, ['cmd_action']);
    assert.deepEqual(schemas?.NodeTriggerContainerActionRequest?.properties?.cmd_action?.enum, [
      'start',
      'stop'
    ]);
    assert.equal(
      schemas?.NodeTriggerContainerActionResponse?.properties?.message?.type,
      'string'
    );
  });

  it('defines container status request and response schemas', () => {
    assert.equal(
      schemas?.NodeTriggerContainerStatusRequest?.properties?.container?.type,
      'string'
    );
    assert.equal(
      schemas?.NodeTriggerContainerStatusResponse?.additionalProperties?.$ref,
      '#/components/schemas/ContainerRuntimeStatus'
    );
    assert.deepEqual(schemas?.ContainerRuntimeStatus?.properties?.status?.enum, [
      'INITIALIZING',
      'RUNNING',
      'STOPPED'
    ]);
  });

  it('defines container image request and response schemas', () => {
    const imageVariants = schemas?.NodeTriggerContainerImageRequest?.oneOf;

    assert.equal(Array.isArray(imageVariants), true);
    assert.deepEqual(imageVariants?.[0]?.required, ['action']);
    assert.deepEqual(imageVariants?.[0]?.properties?.action?.enum, ['list']);
    assert.deepEqual(imageVariants?.[1]?.required, ['action', 'image']);
    assert.deepEqual(imageVariants?.[1]?.properties?.action?.enum, ['delete']);
    assert.equal(imageVariants?.[1]?.properties?.image?.type, 'string');
    assert.equal(
      schemas?.NodeTriggerContainerImageListResponse?.properties?.images?.items?.$ref,
      '#/components/schemas/ContainerImageRecord'
    );
    assert.equal(
      schemas?.NodeTriggerContainerImageDeleteResponse?.properties?.success?.type,
      'string'
    );
    assert.equal(
      schemas?.NodeTriggerContainerImageDeleteResponse?.properties?.error?.type,
      'string'
    );
  });
});
