import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const spec = parse(readFileSync(new URL('../index.yaml', import.meta.url), 'utf8'));
const orders = spec.paths['/provisioning/api/v1/orders'];
const orderModel = spec.components.schemas.OrderModel;
const expectedQueryParams = ['assignee', 'label', 'creator', 'q', 'projectID', 'page', 'perPage', 'priority', 'sort', 'status', 'createdAfter', 'excludeStatus', 'createdBefore', 'transition-status', 'transition-from', 'transition-to'];
const expectedFields = ['assignee', 'attachments', 'carrierCode', 'cellProvider', 'clonedFromId', 'clonedFromOrderNumber', 'createdAt', 'creator', 'custom', 'dataPlan', 'dns1', 'dns2', 'failoverType', 'hyperlinks', 'labels', 'noBill', 'orgId', 'orgName', 'priority', 'projectID', 'rackMounts', 'rma', 'shipStationOrderId', 'shippedDate', 'shippingCompanyName', 'shippingContactEmail', 'shippingStatus', 'siteName', 'stakeholders', 'summary', 'trackingNumber', 'transitions', 'validations'];
const serverManaged = ['attachments', 'clonedFromId', 'clonedFromOrderNumber', 'createdAt', 'creator', 'orgId', 'orgName', 'shipStationOrderId', 'shippedDate', 'shippingStatus', 'trackingNumber', 'transitions', 'validations'];

describe('Order search contract', () => {
  it('documents supported search parameters without organization filtering', () => {
    const params = orders.get.parameters ?? [];
    assert.deepEqual(params.map((param) => spec.components.parameters[param.$ref.split('/').pop()].name).sort(), [...expectedQueryParams].sort());
    assert.equal(spec.components.parameters.orderOrg, undefined);
  });
  it('documents the lowercase total-count pagination header', () => {
    assert.ok(orders.get.responses['200'].headers['x-total-count']);
    assert.doesNotMatch(orders.get.description, /X-Total-Count/);
  });
});

describe('OrderModel contract', () => {
  it('contains legitimate fields returned by the Order API', () => {
    for (const field of expectedFields) assert.ok(orderModel.properties[field], `${field} is present`);
    assert.equal(orderModel.properties.orgId.type, 'string');
    assert.equal(orderModel.properties.createdAt.format, 'date-time');
    for (const field of ['domain', 'nodeName', 'routedNetworks', 'tgHyperlinks', 'tgNotes']) assert.equal(orderModel.properties[field], undefined, `${field} is absent`);
    assert.ok(orderModel.properties.shipStationOrderId);
  });
  it('marks server-managed fields read-only in the shared schema', () => {
    for (const field of serverManaged) assert.equal(orderModel.properties[field].readOnly, true, `${field} is read-only`);
  });
  it('accepts current status values', () => {
    assert.ok(orderModel.properties.status.enum.includes('on hold per client'));
    assert.ok(orderModel.properties.status.enum.includes('production ready'));
  });
});

describe('Public Order endpoint scope', () => {
  it('omits internal enumeration, streaming, webhook, and ShipStation routes', () => {
    for (const path of ['/provisioning/api/v1/orders/orgs', '/provisioning/api/v1/orders.stream/{uid}', '/provisioning/api/v1/config/assignees', '/provisioning/api/v1/orders/webhook', '/provisioning/api/v1/orders/{uid}/shipstation']) assert.equal(spec.paths[path], undefined, `${path} is omitted`);
  });
});
