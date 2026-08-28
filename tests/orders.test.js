import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const spec = parse(readFileSync(new URL('../index.yaml', import.meta.url), 'utf8'));
const orders = spec.paths['/provisioning/api/v1/orders'];
const orderModel = spec.components.schemas.OrderModel;

const expectedQueryParams = [
  'assignee', 'label', 'creator', 'q', 'projectID', 'page', 'org', 'perPage',
  'priority', 'sort', 'status', 'createdAfter', 'excludeStatus', 'createdBefore',
  'transition-status', 'transition-from', 'transition-to',
];

const expectedFields = [
  'assignee', 'attachments', 'carrierCode', 'cellProvider', 'clonedFromId',
  'clonedFromOrderNumber', 'createdAt', 'creator', 'custom', 'dataPlan', 'dns1',
  'dns2', 'failoverType', 'hyperlinks', 'labels', 'noBill', 'orgId', 'orgName',
  'priority', 'projectID', 'rackMounts', 'rma', 'shipStationOrderId', 'shippedDate',
  'shippingCompanyName', 'shippingContactEmail', 'shippingStatus', 'siteName',
  'stakeholders', 'summary', 'tgHyperlinks', 'tgNotes', 'trackingNumber',
  'transitions', 'validations',
];

const serverManaged = [
  'attachments', 'clonedFromId', 'clonedFromOrderNumber', 'createdAt', 'creator',
  'orgId', 'orgName', 'shipStationOrderId', 'shippedDate', 'shippingStatus',
  'tgHyperlinks', 'tgNotes', 'trackingNumber', 'transitions', 'validations',
];

describe('Order search contract', () => {
  it('documents every backend query parameter', () => {
    assert.ok(orders, 'GET /provisioning/api/v1/orders is present');
    const params = orders.get.parameters ?? [];
    assert.deepEqual(params.map((param) => spec.components.parameters[param.$ref.split('/').pop()].name).sort(), expectedQueryParams.sort());
    for (const param of params) {
      const resolved = spec.components.parameters[param.$ref.split('/').pop()];
      assert.equal(resolved.in, 'query');
      assert.ok(resolved.description);
    }
  });

  it('documents the lowercase total-count pagination header', () => {
    assert.ok(orders?.get?.responses?.['200']?.headers?.['x-total-count']);
    assert.doesNotMatch(orders.get.description, /X-Total-Count/);
  });
});

describe('OrderModel contract', () => {
  it('contains the fields returned by the Order API', () => {
    assert.ok(orderModel, 'OrderModel is present');
    for (const field of expectedFields) assert.ok(orderModel.properties[field], `${field} is present`);
    assert.deepEqual(orderModel.properties.orgId.type, 'string');
    assert.equal(orderModel.properties.createdAt.type, 'string');
    assert.equal(orderModel.properties.createdAt.format, 'date-time');
  });

  it('does not retain stale fields absent from the Order API', () => {
    for (const field of ['domain', 'nodeName', 'routedNetworks']) assert.equal(orderModel.properties[field], undefined, `${field} is absent`);
  });

  it('marks server-managed fields read-only in the shared request and response schema', () => {
    for (const field of serverManaged) assert.equal(orderModel.properties[field].readOnly, true, `${field} is read-only`);
  });

  it('accepts every current OrderStatus value', () => {
    assert.ok(orderModel.properties.status.enum.includes('on hold per client'));
    assert.ok(orderModel.properties.status.enum.includes('production ready'));
  });
});

describe('Order endpoint inventory', () => {
  it('keeps the order sibling routes under the provisioning API prefix', () => {
    for (const path of [
      '/provisioning/api/v1/orders/status-counts',
      '/provisioning/api/v1/orders/creators',
      '/provisioning/api/v1/orders/orgs',
      '/provisioning/api/v1/orders/labels',
      '/provisioning/api/v1/orders/{uid}/history',
      '/provisioning/api/v1/orders.stream/{uid}',
      '/provisioning/api/v1/config/assignees',
      '/provisioning/api/v1/orders/webhook',
      '/provisioning/api/v1/orders/{uid}/clone',
      '/provisioning/api/v1/orders/{uid}/attachment',
      '/provisioning/api/v1/orders/{uid}/attachment/{attachmentID}',
      '/provisioning/api/v1/orders/{uid}/shipstation',
    ]) assert.ok(spec.paths[path], `${path} is present`);
  });

  it('requires the attachment upload file', () => {
    const schema = spec.paths['/provisioning/api/v1/orders/{uid}/attachment'].post.requestBody
      .content['multipart/form-data'].schema;
    assert.deepEqual(schema.required, ['file']);
  });

  it('documents order attachment retrieval as a binary response', () => {
    const attachment = spec.paths['/provisioning/api/v1/orders/{uid}/attachment/{attachmentID}'];
    assert.ok(attachment?.get, 'GET order attachment is present');
    assert.deepEqual(attachment.parameters.map((parameter) => parameter.name), ['uid', 'attachmentID']);
    const response = attachment.get.responses['200'];
    assert.ok(response.content['application/octet-stream']);
    assert.deepEqual(response.content['application/octet-stream'].schema, { type: 'string', format: 'binary' });
  });

  it('identifies the order event stream as a WebSocket', () => {
    const stream = spec.paths['/provisioning/api/v1/orders.stream/{uid}'].get;
    assert.match(stream.description, /WebSocket/);
    assert.doesNotMatch(stream.description, /Server-Sent Events|SSE/);
    assert.equal(stream.responses['200'].content, undefined);
  });

  it('marks undocumented object response shapes as unresolved', () => {
    for (const path of [
      '/provisioning/api/v1/orders/orgs',
      '/provisioning/api/v1/orders/{uid}/history',
    ]) {
      const itemSchema = spec.paths[path].get.responses['200'].content['application/json'].schema.items;
      assert.equal(itemSchema.type, 'object');
      assert.equal(itemSchema.additionalProperties, true);
      assert.match(itemSchema.description, /not yet documented/);
    }
  });
});
