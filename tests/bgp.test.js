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

describe("node BGP config endpoint", () => {
  const path = spec.paths["/v2/node/{nodeID}/config/network/bgp"];

  it("defines PUT and no GET or DELETE", () => {
    assert.ok(path, "BGP config path should exist");
    assert.ok(path.put, "PUT should be defined");
    assert.equal(path.get, undefined);
    assert.equal(path.delete, undefined);
  });

  it("uses the top-level BGP update request body", () => {
    assert.equal(
      path.put.requestBody.$ref,
      "#/components/requestBodies/BGPConfigUpdate"
    );
  });

  it("documents the correct permission", () => {
    assert.match(path.put.description, /nodes::configure:network/);
  });

  it("explains that nested BGP objects are managed through sub-resources", () => {
    assert.match(path.put.description, /peer-group/i);
    assert.doesNotMatch(path.put.description, /match\.network/);
  });
});

describe("node BGP management sub-resource paths", () => {
  const expected = [
    "/v2/node/{nodeID}/config/network/bgp/peer-groups",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/peers",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/peers/{peerId}",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/peer/{peerId}",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/import-policies",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/import-policies/{policyId}",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/import-policy/{importPolicyId}",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/import-policy/{importPolicyId}/match/prefixes",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/import-policy/{importPolicyId}/match/prefixes/{prefixId}",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/import-policy/{importPolicyId}/match/prefix/{prefixId}",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/export-policies",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/export-policies/{policyId}",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/export-policy/{exportPolicyId}",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/export-policy/{exportPolicyId}/match/prefixes",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/export-policy/{exportPolicyId}/match/prefixes/{prefixId}",
    "/v2/node/{nodeID}/config/network/bgp/peer-group/{peerGroupId}/export-policy/{exportPolicyId}/match/prefix/{prefixId}"
  ];

  it("documents all BGP peer group, peer, policy, and prefix endpoints", () => {
    for (const path of expected) {
      assert.ok(spec.paths[path], `missing path: ${path}`);
    }
  });
});

describe("generic node trigger path BGP docs", () => {
  const path = spec.paths["/node/{nodeID}/trigger/{event}"];

  it("documents BGP get and restart under the generic trigger endpoint", () => {
    assert.ok(path, "generic node trigger path should exist");
    assert.match(path.post.description, /event=bgp/);
    assert.match(path.post.description, /action: get/);
    assert.match(path.post.description, /action: restart/);
  });

  it("references the BGP trigger request and response schemas", () => {
    const reqAnyOf = path.post.requestBody.content["application/json"].schema.anyOf;
    const resAnyOf = path.post.responses["200"].content["application/json"].schema.anyOf;

    assert.ok(
      reqAnyOf.some(item => item.$ref === "#/components/schemas/NodeTriggerBGPRequest")
    );
    assert.ok(
      resAnyOf.some(item => item.$ref === "#/components/schemas/NodeTriggerBGPGetResponse")
    );
    assert.ok(
      resAnyOf.some(item => item.$ref === "#/components/schemas/NodeTriggerBGPRestartResponse")
    );
  });
});

describe("BGP schemas", () => {
  it("keeps stored BGP config separate from the top-level update request", () => {
    const stored = spec.components.schemas.BGPConfig;
    const update = spec.components.schemas.BGPConfigUpdate;

    assert.ok(stored, "BGPConfig schema should exist");
    assert.ok(update, "BGPConfigUpdate schema should exist");
    assert.ok(stored.properties.groups, "stored config should include groups");
    assert.equal(update.properties.groups, undefined);
    assert.equal(
      spec.components.requestBodies.BGPConfigUpdate.content["application/json"].schema.$ref,
      "#/components/schemas/BGPConfigUpdate"
    );
  });

  it("references BGPConfig from the node config schema as _bgp", () => {
    const nodeSchema = spec.components.schemas.Node;
    assert.equal(
      nodeSchema.properties.config.properties._bgp.$ref,
      "#/components/schemas/BGPConfig"
    );
  });

  it("documents export policy match.cluster and action.prefixes, but not fake match.network fields", () => {
    const schema = spec.components.schemas.BGPExportPolicy;
    assert.ok(schema.properties.match.properties.cluster);
    assert.equal(schema.properties.match.properties.network, undefined);
    assert.equal(schema.properties.match.properties.prefixes, undefined);
    assert.equal(
      schema.properties.action.properties.prefixes.items.$ref,
      "#/components/schemas/BGPExportPrefix"
    );
  });

  it("does not document exact matching on export prefixes", () => {
    const schema = spec.components.schemas.BGPExportPrefix;
    assert.equal(schema.properties.exact, undefined);
  });

  it("keeps optional description fields off stored peer-group and peer schemas when the backend does not persist them", () => {
    assert.equal(spec.components.schemas.BGPPeerGroup.properties.description, undefined);
    assert.equal(spec.components.schemas.BGPPeer.properties.description, undefined);
  });
});

describe("BGP trigger response schemas", () => {
  it("documents peer status with routes, rejections, and advertised prefixes", () => {
    const schema = spec.components.schemas.NodeTriggerBGPPeerStatus;
    assert.equal(
      schema.properties.routes.items.$ref,
      "#/components/schemas/NodeTriggerBGPRoute"
    );
    assert.equal(
      schema.properties.rejections.items.$ref,
      "#/components/schemas/NodeTriggerBGPRejectedRoute"
    );
    assert.equal(
      schema.properties.advertised.items.$ref,
      "#/components/schemas/NodeTriggerBGPAdvertisedPrefix"
    );
  });

  it("documents runtime BGP get response as router.peers", () => {
    const schema = spec.components.schemas.NodeTriggerBGPGetResponse;
    assert.equal(
      schema.properties.router.properties.peers.items.$ref,
      "#/components/schemas/NodeTriggerBGPPeerStatus"
    );
  });

  it("documents the local BGP router-id on the runtime get response", () => {
    const schema = spec.components.schemas.NodeTriggerBGPGetResponse;
    assert.equal(
      schema.properties.router.properties.router.type,
      "string"
    );
    assert.ok(
      schema.properties.router.required.includes("router"),
      "router.router should be required"
    );
  });
});
