import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "yaml";

const spec = parse(fs.readFileSync("index.yaml", "utf8"));

describe("BGP plugin paths", () => {
  it("defines the node BGP config endpoint", () => {
    const path = spec.paths["/v2/node/{nodeID}/config/network/bgp"];
    assert.ok(path, "/v2/node/{nodeID}/config/network/bgp should exist");
    assert.ok(path.put, "PUT should be defined on the node BGP path");
    assert.equal(path.put.operationId, "updateNodeBGPConfig");
  });

  it("references the BGPConfig request body", () => {
    const node = spec.paths["/v2/node/{nodeID}/config/network/bgp"].put;
    assert.equal(
      node.requestBody.$ref,
      "#/components/requestBodies/BGPConfig"
    );
  });

  it("documents the 422 validation response", () => {
    const resp =
      spec.paths["/v2/node/{nodeID}/config/network/bgp"].put.responses["422"];
    assert.ok(resp, "node BGP path should have a 422 response");
    assert.match(resp.description, /validation/i);
    assert.equal(
      resp.content["application/json"].schema.$ref,
      "#/components/schemas/ValidationFailed"
    );
  });

  it("tags the node endpoint as Appliance", () => {
    assert.deepEqual(
      spec.paths["/v2/node/{nodeID}/config/network/bgp"].put.tags,
      ["Appliance"]
    );
  });
});

describe("BGPConfig request body", () => {
  const body = spec.components.requestBodies.BGPConfig;

  it("is required and references the BGPConfig schema", () => {
    assert.ok(body, "BGPConfig request body should exist");
    assert.equal(body.required, true);
    assert.equal(
      body.content["application/json"].schema.$ref,
      "#/components/schemas/BGPConfig"
    );
  });
});

describe("BGPConfig schema", () => {
  const schema = spec.components.schemas.BGPConfig;

  it("requires the core router fields", () => {
    assert.ok(schema, "BGPConfig schema should exist");
    for (const field of ["enabled", "id", "asn"]) {
      assert.ok(
        schema.required.includes(field),
        `BGPConfig should require ${field}`
      );
    }
  });

  it("has the expected top-level properties", () => {
    for (const prop of ["enabled", "id", "asn", "client", "groups"]) {
      assert.ok(schema.properties[prop], `missing property ${prop}`);
    }
    assert.equal(schema.properties.enabled.type, "boolean");
    assert.equal(schema.properties.id.type, "string");
    assert.equal(schema.properties.asn.type, "integer");
    assert.equal(schema.properties.client.type, "boolean");
    assert.equal(schema.properties.groups.type, "array");
    assert.equal(
      schema.properties.groups.items.$ref,
      "#/components/schemas/BGPPeerGroup"
    );
  });

  it("includes a worked example with peers, imports, and exports", () => {
    assert.ok(schema.example, "BGPConfig should have an example");
    assert.ok(Array.isArray(schema.example.groups));
    const group = schema.example.groups[0];
    assert.ok(group.peers.length > 0, "example should include a peer");
    assert.ok(group.imports.length > 0, "example should include an import policy");
    assert.ok(group.exports.length > 0, "example should include an export policy");
  });
});

describe("BGPPeerGroup schema", () => {
  const schema = spec.components.schemas.BGPPeerGroup;

  it("requires _id and name", () => {
    assert.ok(schema, "BGPPeerGroup schema should exist");
    assert.ok(schema.required.includes("_id"));
    assert.ok(schema.required.includes("name"));
  });

  it("references BGPPeer, BGPImportPolicy, and BGPExportPolicy", () => {
    assert.equal(
      schema.properties.peers.items.$ref,
      "#/components/schemas/BGPPeer"
    );
    assert.equal(
      schema.properties.imports.items.$ref,
      "#/components/schemas/BGPImportPolicy"
    );
    assert.equal(
      schema.properties.exports.items.$ref,
      "#/components/schemas/BGPExportPolicy"
    );
  });
});

describe("BGPPeer schema", () => {
  const schema = spec.components.schemas.BGPPeer;

  it("requires _id, name, asn, and ip", () => {
    assert.ok(schema, "BGPPeer schema should exist");
    for (const f of ["_id", "name", "asn", "ip"]) {
      assert.ok(schema.required.includes(f), `BGPPeer should require ${f}`);
    }
  });

  it("makes secret optional", () => {
    assert.ok(schema.properties.secret, "secret should be defined");
    assert.ok(
      !schema.required.includes("secret"),
      "secret should not be required"
    );
  });
});

describe("BGPImportPolicy schema", () => {
  const schema = spec.components.schemas.BGPImportPolicy;

  it("requires _id, name, match, and action", () => {
    assert.ok(schema, "BGPImportPolicy schema should exist");
    for (const f of ["_id", "name", "match", "action"]) {
      assert.ok(
        schema.required.includes(f),
        `BGPImportPolicy should require ${f}`
      );
    }
  });

  it("constrains action.action to allow or deny", () => {
    const enumVals = schema.properties.action.properties.action.enum;
    assert.deepEqual(enumVals.sort(), ["allow", "deny"]);
  });

  it("references BGPImportPrefix in match.prefixes", () => {
    assert.equal(
      schema.properties.match.properties.prefixes.items.$ref,
      "#/components/schemas/BGPImportPrefix"
    );
  });
});

describe("BGPImportPrefix schema", () => {
  const schema = spec.components.schemas.BGPImportPrefix;

  it("requires _id, prefix, and exact", () => {
    assert.ok(schema, "BGPImportPrefix schema should exist");
    for (const f of ["_id", "prefix", "exact"]) {
      assert.ok(
        schema.required.includes(f),
        `BGPImportPrefix should require ${f}`
      );
    }
    assert.equal(schema.properties.exact.type, "boolean");
  });
});

describe("BGPExportPolicy schema", () => {
  const schema = spec.components.schemas.BGPExportPolicy;

  it("requires _id, name, match, and action", () => {
    assert.ok(schema, "BGPExportPolicy schema should exist");
    for (const f of ["_id", "name", "match", "action"]) {
      assert.ok(
        schema.required.includes(f),
        `BGPExportPolicy should require ${f}`
      );
    }
  });

  it("documents the cluster, network, and prefixes match fields", () => {
    const matchProps = schema.properties.match.properties;
    assert.ok(matchProps.cluster, "match.cluster should be documented");
    assert.equal(matchProps.cluster.type, "boolean");
    assert.ok(
      matchProps.network,
      "match.network should be documented (WOR-9737)"
    );
    assert.equal(matchProps.network.type, "integer");
    assert.equal(
      matchProps.prefixes.items.$ref,
      "#/components/schemas/BGPExportPrefix"
    );
  });

  it("describes auto-withdraw behaviour for match.network", () => {
    const desc = schema.properties.match.properties.network.description;
    assert.match(desc, /withdraw/i);
  });

  it("constrains action.action to allow or deny", () => {
    const enumVals = schema.properties.action.properties.action.enum;
    assert.deepEqual(enumVals.sort(), ["allow", "deny"]);
  });
});

describe("BGPExportPrefix schema", () => {
  const schema = spec.components.schemas.BGPExportPrefix;

  it("requires _id and prefix", () => {
    assert.ok(schema, "BGPExportPrefix schema should exist");
    assert.ok(schema.required.includes("_id"));
    assert.ok(schema.required.includes("prefix"));
  });
});
