/**
 * Tests for the v2 audit endpoints and their schemas
 * Covers: changes, node, and auth audit list + download endpoints
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

// --- Helpers ---

const commonQueryParams = ['sTime', 'eTime', 'page', 'limit', 'sort', 'q'];

function getParams(pathKey) {
  return spec.paths?.[pathKey]?.get?.parameters ?? [];
}

function findParam(params, name) {
  return params.find((p) => p.name === name);
}

// --- /v2/audit/changes ---

describe('/v2/audit/changes', () => {
  const pathKey = '/v2/audit/changes';
  const op = spec.paths?.[pathKey]?.get;

  it('path exists', () => {
    assert.ok(spec.paths?.[pathKey], `${pathKey} should exist`);
  });

  it('has correct operationId', () => {
    assert.equal(op?.operationId, 'listChangeAudits');
  });

  it('has correct summary', () => {
    assert.equal(op?.summary, 'List configuration change audit logs');
  });

  it('has Audit tag', () => {
    assert.ok(op?.tags?.includes('Audit'));
  });

  it('description has --- separator and permission', () => {
    assert.ok(op?.description?.includes('---'));
    assert.ok(op?.description?.includes('audits::read:config'));
  });

  it('has common query parameters', () => {
    const params = getParams(pathKey);
    for (const name of commonQueryParams) {
      assert.ok(findParam(params, name), `should have ${name} param`);
    }
  });

  it('has array params with style:form explode:false', () => {
    const params = getParams(pathKey);
    for (const name of ['auditTypes', 'itemTypes', 'userNames', 'itemIDs', 'ips']) {
      const p = findParam(params, name);
      assert.ok(p, `should have ${name} param`);
      assert.equal(p.style, 'form', `${name} style should be form`);
      assert.equal(p.explode, false, `${name} explode should be false`);
    }
  });

  it('auditTypes has correct enum', () => {
    const p = findParam(getParams(pathKey), 'auditTypes');
    const enums = p?.schema?.items?.enum;
    assert.deepEqual([...enums].sort(), ['action', 'create', 'delete', 'update']);
  });

  it('200 response has x-total-count header', () => {
    const header = op?.responses?.['200']?.headers?.['x-total-count'];
    assert.ok(header, 'should have x-total-count header');
  });

  it('200 response is JSON array of ChangeAuditRecord', () => {
    const schema = op?.responses?.['200']?.content?.['application/json']?.schema;
    assert.equal(schema?.type, 'array');
    assert.equal(schema?.items?.$ref, '#/components/schemas/ChangeAuditRecord');
  });
});

// --- /v2/audit/changes/download ---

describe('/v2/audit/changes/download', () => {
  const pathKey = '/v2/audit/changes/download';
  const op = spec.paths?.[pathKey]?.get;

  it('path exists', () => {
    assert.ok(spec.paths?.[pathKey], `${pathKey} should exist`);
  });

  it('has correct operationId', () => {
    assert.equal(op?.operationId, 'downloadChangeAudits');
  });

  it('has Audit tag', () => {
    assert.ok(op?.tags?.includes('Audit'));
  });

  it('has common query parameters', () => {
    const params = getParams(pathKey);
    for (const name of commonQueryParams) {
      assert.ok(findParam(params, name), `should have ${name} param`);
    }
  });

  it('has array params with style:form explode:false', () => {
    const params = getParams(pathKey);
    for (const name of ['auditTypes', 'itemTypes', 'userNames', 'itemIDs', 'ips']) {
      const p = findParam(params, name);
      assert.ok(p, `should have ${name} param`);
      assert.equal(p.style, 'form');
      assert.equal(p.explode, false);
    }
  });

  it('200 response is text/csv', () => {
    const content = op?.responses?.['200']?.content;
    assert.ok(content?.['text/csv'], 'should have text/csv response');
  });
});

// --- /v2/audit/node ---

describe('/v2/audit/node', () => {
  const pathKey = '/v2/audit/node';
  const op = spec.paths?.[pathKey]?.get;

  it('path exists', () => {
    assert.ok(spec.paths?.[pathKey], `${pathKey} should exist`);
  });

  it('has correct operationId', () => {
    assert.equal(op?.operationId, 'listNodeAudits');
  });

  it('has correct summary', () => {
    assert.equal(op?.summary, 'List node operational audit logs');
  });

  it('has Audit tag', () => {
    assert.ok(op?.tags?.includes('Audit'));
  });

  it('description has --- separator and permission', () => {
    assert.ok(op?.description?.includes('---'));
    assert.ok(op?.description?.includes('audits::read:node'));
  });

  it('has common query parameters', () => {
    const params = getParams(pathKey);
    for (const name of commonQueryParams) {
      assert.ok(findParam(params, name), `should have ${name} param`);
    }
  });

  it('has array params categories and fqdns with style:form explode:false', () => {
    const params = getParams(pathKey);
    for (const name of ['categories', 'fqdns']) {
      const p = findParam(params, name);
      assert.ok(p, `should have ${name} param`);
      assert.equal(p.style, 'form');
      assert.equal(p.explode, false);
    }
  });

  it('categories has correct enum', () => {
    const p = findParam(getParams(pathKey), 'categories');
    const enums = p?.schema?.items?.enum;
    assert.deepEqual([...enums].sort(), ['Node Action', 'Node Update', 'OS Update']);
  });

  it('200 response has x-total-count header', () => {
    assert.ok(op?.responses?.['200']?.headers?.['x-total-count']);
  });

  it('200 response is JSON array of NodeAuditRecord', () => {
    const schema = op?.responses?.['200']?.content?.['application/json']?.schema;
    assert.equal(schema?.type, 'array');
    assert.equal(schema?.items?.$ref, '#/components/schemas/NodeAuditRecord');
  });
});

// --- /v2/audit/node/download ---

describe('/v2/audit/node/download', () => {
  const pathKey = '/v2/audit/node/download';
  const op = spec.paths?.[pathKey]?.get;

  it('path exists', () => {
    assert.ok(spec.paths?.[pathKey], `${pathKey} should exist`);
  });

  it('has correct operationId', () => {
    assert.equal(op?.operationId, 'downloadNodeAudits');
  });

  it('has Audit tag', () => {
    assert.ok(op?.tags?.includes('Audit'));
  });

  it('has array params categories and fqdns with style:form explode:false', () => {
    const params = getParams(pathKey);
    for (const name of ['categories', 'fqdns']) {
      const p = findParam(params, name);
      assert.ok(p, `should have ${name} param`);
      assert.equal(p.style, 'form');
      assert.equal(p.explode, false);
    }
  });

  it('200 response is text/csv', () => {
    assert.ok(op?.responses?.['200']?.content?.['text/csv']);
  });
});

// --- /v2/audit/auth ---

describe('/v2/audit/auth', () => {
  const pathKey = '/v2/audit/auth';
  const op = spec.paths?.[pathKey]?.get;

  it('path exists', () => {
    assert.ok(spec.paths?.[pathKey], `${pathKey} should exist`);
  });

  it('has correct operationId', () => {
    assert.equal(op?.operationId, 'listAuthAudits');
  });

  it('has correct summary', () => {
    assert.equal(op?.summary, 'List user authentication audit logs');
  });

  it('has Audit tag', () => {
    assert.ok(op?.tags?.includes('Audit'));
  });

  it('description has --- separator and permission', () => {
    assert.ok(op?.description?.includes('---'));
    assert.ok(op?.description?.includes('audits::read:user'));
  });

  it('has common query parameters', () => {
    const params = getParams(pathKey);
    for (const name of commonQueryParams) {
      assert.ok(findParam(params, name), `should have ${name} param`);
    }
  });

  it('has array params ips and userIDs with style:form explode:false', () => {
    const params = getParams(pathKey);
    for (const name of ['ips', 'userIDs']) {
      const p = findParam(params, name);
      assert.ok(p, `should have ${name} param`);
      assert.equal(p.style, 'form');
      assert.equal(p.explode, false);
    }
  });

  it('200 response has x-total-count header', () => {
    assert.ok(op?.responses?.['200']?.headers?.['x-total-count']);
  });

  it('200 response is JSON array of AuthAuditRecord', () => {
    const schema = op?.responses?.['200']?.content?.['application/json']?.schema;
    assert.equal(schema?.type, 'array');
    assert.equal(schema?.items?.$ref, '#/components/schemas/AuthAuditRecord');
  });
});

// --- /v2/audit/auth/download ---

describe('/v2/audit/auth/download', () => {
  const pathKey = '/v2/audit/auth/download';
  const op = spec.paths?.[pathKey]?.get;

  it('path exists', () => {
    assert.ok(spec.paths?.[pathKey], `${pathKey} should exist`);
  });

  it('has correct operationId', () => {
    assert.equal(op?.operationId, 'downloadAuthAudits');
  });

  it('has Audit tag', () => {
    assert.ok(op?.tags?.includes('Audit'));
  });

  it('has array params ips and userIDs with style:form explode:false', () => {
    const params = getParams(pathKey);
    for (const name of ['ips', 'userIDs']) {
      const p = findParam(params, name);
      assert.ok(p, `should have ${name} param`);
      assert.equal(p.style, 'form');
      assert.equal(p.explode, false);
    }
  });

  it('200 response is text/csv', () => {
    assert.ok(op?.responses?.['200']?.content?.['text/csv']);
  });
});

// --- Schemas ---

describe('ChangeAuditRecord Schema', () => {
  const schema = spec.components?.schemas?.ChangeAuditRecord;

  it('exists', () => {
    assert.ok(schema, 'ChangeAuditRecord schema should exist');
  });

  it('has correct properties', () => {
    const expected = ['uid', 'org', 'timestamp', 'ip', 'userName', 'itemType', 'itemId', 'auditType', 'message'];
    for (const prop of expected) {
      assert.ok(schema?.properties?.[prop], `should have ${prop} property`);
    }
  });
});

describe('NodeAuditRecord Schema', () => {
  const schema = spec.components?.schemas?.NodeAuditRecord;

  it('exists', () => {
    assert.ok(schema, 'NodeAuditRecord schema should exist');
  });

  it('has correct properties', () => {
    const expected = ['uid', 'org', 'timestamp', 'fqdn', 'category', 'value', 'expires'];
    for (const prop of expected) {
      assert.ok(schema?.properties?.[prop], `should have ${prop} property`);
    }
  });
});

describe('AuthAuditRecord Schema', () => {
  const schema = spec.components?.schemas?.AuthAuditRecord;

  it('exists', () => {
    assert.ok(schema, 'AuthAuditRecord schema should exist');
  });

  it('has correct properties', () => {
    const expected = ['uid', 'timestamp', 'ip', 'message', 'userId'];
    for (const prop of expected) {
      assert.ok(schema?.properties?.[prop], `should have ${prop} property`);
    }
  });
});

// --- Legacy endpoints should be deprecated ---

describe('Legacy audit endpoints are deprecated', () => {
  const legacyPaths = [
    '/audit/tail/config',
    '/audit/download/config',
    '/audit/tail/node',
    '/audit/download/node',
    '/audit/tail/user',
    '/audit/download/user',
  ];

  for (const pathKey of legacyPaths) {
    it(`${pathKey} is deprecated`, () => {
      const pathDef = spec.paths?.[pathKey];
      assert.ok(pathDef, `${pathKey} should exist`);
      const op = pathDef.get;
      assert.ok(op, `${pathKey} should have GET operation`);
      assert.equal(op.deprecated, true, `${pathKey} GET should be deprecated`);
    });
  }
});
