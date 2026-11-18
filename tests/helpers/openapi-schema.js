import assert from 'node:assert/strict';

// Follows a local $ref ('#/components/...') to its target; returns other values unchanged
export const derefIn = (spec) => {
  const deref = (value) => {
    if (!value?.$ref) return value;
    const target = value.$ref.replace(/^#\//, '').split('/').reduce((node, key) => node?.[key], spec);
    assert.ok(target, `${value.$ref} should resolve`);
    return deref(target);
  };
  return deref;
};

const typeOf = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
};

// Minimal OpenAPI 3.0 schema validator for the keywords the observability schemas use. Unknown
// properties are errors so examples cannot drift from the schema. Returns a list of problems.
export const validatorFor = (spec) => {
  const deref = derefIn(spec);

  const flatten = (raw) => {
    const schema = deref(raw);
    if (!schema.allOf) return schema;
    const parts = schema.allOf.map(flatten);
    return {
      ...schema,
      allOf: undefined,
      type: parts.find((p) => p.type)?.type ?? schema.type,
      properties: Object.assign({}, ...parts.map((p) => p.properties ?? {}), schema.properties ?? {}),
      required: [...new Set([...parts.flatMap((p) => p.required ?? []), ...(schema.required ?? [])])],
    };
  };

  const validate = (raw, value, at = '$') => {
    const schema = flatten(raw);
    const type = typeOf(value);
    if (value === null) {
      return schema.nullable ? [] : [`${at}: null is not allowed`];
    }
    const errors = [];
    if (schema.type) {
      const ok = schema.type === type || (schema.type === 'number' && type === 'integer');
      if (!ok) return [`${at}: expected ${schema.type}, got ${type}`];
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
    }
    if (type === 'string') {
      if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${at}: longer than ${schema.maxLength}`);
      if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at}: shorter than ${schema.minLength}`);
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
    }
    if (type === 'integer' || type === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: below ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: above ${schema.maximum}`);
    }
    if (type === 'array') {
      if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: fewer than ${schema.minItems} items`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: more than ${schema.maxItems} items`);
      if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) errors.push(`${at}: duplicate items`);
      if (schema.items) value.forEach((v, i) => errors.push(...validate(schema.items, v, `${at}[${i}]`)));
    }
    if (type === 'object') {
      const properties = schema.properties ?? {};
      for (const name of schema.required ?? []) {
        if (!(name in value)) errors.push(`${at}: missing required ${name}`);
      }
      if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) errors.push(`${at}: too many properties`);
      for (const [name, v] of Object.entries(value)) {
        if (properties[name]) {
          errors.push(...validate(properties[name], v, `${at}.${name}`));
        } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
          errors.push(...validate(schema.additionalProperties, v, `${at}.${name}`));
        } else if (schema.properties || schema.additionalProperties === false) {
          errors.push(`${at}: unknown property ${name}`);
        }
      }
    }
    return errors;
  };

  return validate;
};
