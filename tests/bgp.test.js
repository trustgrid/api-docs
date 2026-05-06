import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const specPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "index.yaml"
);
const spec = parse(fs.readFileSync(specPath, "utf8"));

describe("BGP plugin paths", () => {
  const path = spec.paths["/v2/node/{nodeID}/config/network/bgp"];

  it("defines PUT on the node BGP path", () => {
    assert.ok(path, "/v2/node/{nodeID}/config/network/bgp should exist");
    assert.ok(path.put, "PUT should be defined to replace config");
    assert.equal(path.put.operationId, "updateNodeBGPConfig");
  });

  it("does not define GET or DELETE — BGP is read via the node config and disabled by PUTing enabled:false", () => {
    assert.equal(path.get, undefined, "GET is not implemented");
    assert.equal(path.delete, undefined, "DELETE is not implemented");
  });

  it("references the BGPConfig request body on PUT", () => {
    assert.equal(
      path.put.requestBody.$ref,
      "#/components/requestBodies/BGPConfig"
    );
  });

  it("documents the 422 validation response on PUT", () => {
    const resp = path.put.responses["422"];
    assert.ok(resp, "PUT should have a 422 response");
    assert.match(resp.description, /validation/i);
    assert.equal(
      resp.content["application/json"].schema.$ref,
      "#/components/schemas/ValidationFailed"
    );
  });

  it("uses the plural `nodes::` permission token", () => {
    assert.match(
      path.put.description,
      /nodes::/,
      "BGP PUT should use plural `nodes::` permission strings"
    );
    assert.doesNotMatch(
      path.put.description,
      /\bnode::configure/,
      "BGP PUT should not use singular `node::configure`"
    );
  });

  it("tags PUT as Appliance", () => {
    assert.deepEqual(path.put.tags, ["Appliance"]);
  });

  it("explains how cluster BGP is configured (per-member PUTs)", () => {
    assert.match(
      path.put.description,
      /cluster/i,
      "PUT description should explain cluster BGP semantics"
    );
    assert.match(
      path.put.description,
      /match\.cluster/,
      "PUT description should mention match.cluster gating"
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
    // `client` is enforced by the server validator — omitting it returns 422.
    for (const field of ["enabled", "id", "asn", "client"]) {
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

  it("exposes a description field for UI annotation", () => {
    assert.ok(schema.properties.description);
    assert.equal(schema.properties.description.type, "string");
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

  it("exposes a description field for UI annotation", () => {
    assert.ok(schema.properties.description);
    assert.equal(schema.properties.description.type, "string");
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
    assert.deepEqual([...enumVals].sort(), ["allow", "deny"]);
  });

  it("references BGPImportPrefix in match.prefixes", () => {
    assert.equal(
      schema.properties.match.properties.prefixes.items.$ref,
      "#/components/schemas/BGPImportPrefix"
    );
  });

  it("exposes a description field for UI annotation", () => {
    assert.ok(schema.properties.description);
    assert.equal(schema.properties.description.type, "string");
  });
});

describe("BGPImportPrefix schema", () => {
  const schema = spec.components.schemas.BGPImportPrefix;

  it("requires _id and prefix; exact is optional and matches export shape", () => {
    assert.ok(schema, "BGPImportPrefix schema should exist");
    for (const f of ["_id", "prefix"]) {
      assert.ok(
        schema.required.includes(f),
        `BGPImportPrefix should require ${f}`
      );
    }
    assert.ok(
      !schema.required.includes("exact"),
      "exact should be optional to match BGPExportPrefix"
    );
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

  it("enumerates the auto-withdraw triggers for match.network", () => {
    const desc = schema.properties.match.properties.network.description;
    assert.match(desc, /withdraw/i);
    // The triggers documented for WOR-9737: data-plane disconnect, no
    // learned vnet route, route-monitor failure, and inactive cluster member.
    for (const trigger of [
      /data.plane/i,
      /learned route/i,
      /route monitor/i,
      /active member/i
    ]) {
      assert.match(
        desc,
        trigger,
        `match.network description should document ${trigger}`
      );
    }
  });

  it("constrains action.action to allow or deny", () => {
    const enumVals = schema.properties.action.properties.action.enum;
    assert.deepEqual([...enumVals].sort(), ["allow", "deny"]);
  });

  it("exposes a description field for UI annotation", () => {
    assert.ok(schema.properties.description);
    assert.equal(schema.properties.description.type, "string");
  });

  it("documents action.prefixes as a backwards-compatibility list", () => {
    const desc = schema.properties.action.properties.prefixes.description;
    assert.match(desc, /match\.prefixes/i);
    assert.match(desc, /backwards[\s-]compat|legacy/i);
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

describe("BGP cluster plugin paths", () => {
  it("does not define a cluster-level BGP endpoint", () => {
    // Cluster BGP is configured by PUTing the same config to each member's
    // node ID, not via a single cluster endpoint. See the node PUT description.
    assert.equal(
      spec.paths["/v2/cluster/{clusterFQDN}/config/network/bgp"],
      undefined
    );
  });
});
