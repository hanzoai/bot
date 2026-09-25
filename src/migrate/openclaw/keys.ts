import { BotSchema } from "../../config/zod-schema.js";

/**
 * The set of keys bot.json admits, as a tree: an object node lists its
 * admitted keys, `*` admits any key, `[]` describes array items, and `true`
 * admits anything below it. Derived from BotSchema, so it cannot drift.
 */
export type KeyTree = true | { [key: string]: KeyTree };

type JsonSchema = {
  $ref?: string;
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  patternProperties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  type?: string | string[];
  definitions?: Record<string, JsonSchema>;
};

let cached: KeyTree | undefined;

export function botConfigKeyTree(): KeyTree {
  if (cached === undefined) {
    const schema = BotSchema.toJSONSchema({
      target: "draft-07",
      unrepresentable: "any",
      io: "input",
    }) as JsonSchema;
    cached = treeOf(schema, schema.definitions ?? {}, new Set());
  }
  return cached;
}

function merge(a: KeyTree | undefined, b: KeyTree): KeyTree {
  if (a === undefined) {
    return b;
  }
  if (a === true || b === true) {
    return true;
  }
  const out: { [key: string]: KeyTree } = { ...a };
  for (const [key, sub] of Object.entries(b)) {
    out[key] = merge(out[key], sub);
  }
  return out;
}

function treeOf(schema: JsonSchema, defs: Record<string, JsonSchema>, seen: Set<string>): KeyTree {
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop() ?? "";
    if (seen.has(name)) {
      return true;
    }
    const target = defs[name];
    return target ? treeOf(target, defs, new Set([...seen, name])) : true;
  }
  let tree: KeyTree | undefined;
  for (const branch of [
    ...(schema.anyOf ?? []),
    ...(schema.oneOf ?? []),
    ...(schema.allOf ?? []),
  ]) {
    tree = merge(tree, treeOf(branch, defs, seen));
  }
  const isObject =
    schema.properties !== undefined ||
    schema.patternProperties !== undefined ||
    schema.additionalProperties !== undefined ||
    schema.type === "object";
  if (isObject) {
    const node: { [key: string]: KeyTree } = {};
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      node[key] = treeOf(sub, defs, seen);
    }
    const extra = schema.additionalProperties;
    if (extra === undefined || extra === true) {
      node["*"] = true;
    } else if (extra !== false) {
      node["*"] = treeOf(extra, defs, seen);
    }
    for (const sub of Object.values(schema.patternProperties ?? {})) {
      node["*"] = merge(node["*"], treeOf(sub, defs, seen));
    }
    tree = merge(tree, node);
  }
  if (schema.items !== undefined) {
    const items = Array.isArray(schema.items) ? schema.items : [schema.items];
    let itemTree: KeyTree | undefined;
    for (const item of items) {
      itemTree = merge(itemTree, treeOf(item, defs, seen));
    }
    tree = merge(tree, { "[]": itemTree ?? true });
  }
  return tree ?? true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function child(node: KeyTree, key: string): KeyTree | undefined {
  if (node === true) {
    return true;
  }
  return Object.hasOwn(node, key) ? node[key] : node["*"];
}

/**
 * Remove every key the tree does not admit. Returns the kept value and the
 * dotted paths it removed, outermost first, so a dropped subtree is reported once.
 */
export function pruneToTree(
  value: unknown,
  tree: KeyTree,
  path = "",
): { value: unknown; dropped: string[] } {
  if (tree === true) {
    return { value, dropped: [] };
  }
  if (Array.isArray(value)) {
    const items = child(tree, "[]");
    if (items === undefined) {
      return { value, dropped: [] };
    }
    const dropped: string[] = [];
    const kept = value.map((item, index) => {
      const result = pruneToTree(item, items, `${path}[${index}]`);
      dropped.push(...result.dropped);
      return result.value;
    });
    return { value: kept, dropped };
  }
  if (!isPlainObject(value)) {
    return { value, dropped: [] };
  }
  const kept: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, sub] of Object.entries(value)) {
    const subPath = path ? `${path}.${key}` : key;
    const node = child(tree, key);
    if (node === undefined) {
      dropped.push(subPath);
      continue;
    }
    const result = pruneToTree(sub, node, subPath);
    kept[key] = result.value;
    dropped.push(...result.dropped);
  }
  return { value: kept, dropped };
}
