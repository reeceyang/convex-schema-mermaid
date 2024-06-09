import {
  GenericSchema,
  SchemaDefinition,
  TableDefinition,
} from "convex/server";
import { JSONValue, Validator } from "convex/values";

/** internal type copied from convex/values */
type ObjectFieldType = { fieldType: ValidatorJSON; optional: boolean };

/** internal type copied from convex/values */
type ValidatorJSON =
  | {
      type: "null";
    }
  | { type: "number" }
  | { type: "bigint" }
  | { type: "boolean" }
  | { type: "string" }
  | { type: "bytes" }
  | { type: "any" }
  | {
      type: "literal";
      value: JSONValue;
    }
  | { type: "id"; tableName: string }
  | { type: "array"; value: ValidatorJSON }
  | { type: "record"; keys: ValidatorJSON; values: ObjectFieldType }
  | { type: "object"; value: Record<string, ObjectFieldType> }
  | { type: "union"; value: ValidatorJSON[] };

/** {@link Validator} with internal `json` field patched in */
type ValidatorWithJson = Validator<any, any, any> & { json: ValidatorJSON };

/** {@link TableDefinition} with internal `documentType` field patched in */
type TableDefinitionWithDocumentType = Omit<TableDefinition, "documentType"> & {
  documentType: ValidatorWithJson;
};

// interface Node {
//   name: string;
//   type: ValidatorJSON["type"];
//   ancestors: (ObjectSubgraph | UnionSubgraph)[];
// }

// interface ObjectSubgraph extends Node {
//   type: "object";
//   fields: Node[];
// }

// interface UnionSubgraph extends Node {
//   type: "union";
//   elements: Node[];
// }

const fieldToNode = (fieldName: string, fieldType: string) =>
  `${fieldName}: ${fieldType}`;

const linkFieldToNode = (fieldName: string, tableName: string) =>
  `${fieldToNode(fieldName, "id")} '${tableName}'`;

/** converts a fieldType to a node */
const fieldTypeToNode = (
  fieldName: string,
  fieldType: ValidatorJSON,
  subgraphNames: [string, ...string[]]
) => {
  // TODO: handle optional fields
  switch (fieldType.type) {
    case "object":
      return objectToSubgraph(fieldType.value, [...subgraphNames, fieldName]);
    case "union":
      return unionToSubgraph(fieldType.value, [...subgraphNames, fieldName]);
    case "array":
      return arrayToSubgraph(fieldType.value, [...subgraphNames, fieldName]);
    case "id":
      return linkFieldToNode(fieldName, fieldType.tableName);
    default:
      return fieldToNode(fieldName, fieldType.type);
  }
};

/**
 * Generate a Mermaid subgraph representation of an object. Nested object
 * subgraphs are labeled with the field name, but are internally referred to
 * with a dot-separated path of ancestor subgraph names. For example, in
 * ```ts
 * defineTable({a: v.object({b: v.object({c: v.object()})})})
 * ```
 * the subgraph for `c` will be
 * ```mermaid
 * subgraph a.b.c[c]
 * end
 * ```
 * @param object the validator json value for the object
 * @param subgraphNames a list of subgraph ancestor names
 * @returns a mermaid subgraph representation of the object
 */
const objectToSubgraph = (
  object: Record<string, ObjectFieldType>,
  subgraphNames: [string, ...string[]]
): string => {
  const fieldNodes = Object.entries(object)
    .map(([fieldName, { fieldType }]) => {
      const node = fieldTypeToNode(fieldName, fieldType, subgraphNames);
      if (
        fieldType.type === "object" ||
        fieldType.type === "union" ||
        fieldType.type === "array"
      ) {
        // don't wrap with []
        return node;
      }
      return `    ${subgraphNames.join(".")}.${fieldName}[${node}]`;
    })
    .join("\n");

  return `  subgraph ${subgraphNames.join(".")}[${subgraphNames.at(-1)}]\n${fieldNodes}\n  end\n`;
};

/**
 * Pretend a union is an object with fields named `union.0`, `union.1`, etc.
 */
const unionToPretendObject = (
  union: ValidatorJSON[]
): Record<string, ObjectFieldType> =>
  Object.fromEntries(
    union.map((fieldType, i) => [`union.${i}`, { fieldType, optional: false }])
  );

const unionToSubgraph = (
  union: ValidatorJSON[],
  subgraphNames: [string, ...string[]]
): string => {
  return objectToSubgraph(unionToPretendObject(union), subgraphNames);
};

/**
 * Pretend an array is an object with a field named `array.0`
 */
const arrayToPretendObject = (
  array: ValidatorJSON
): Record<string, ObjectFieldType> => ({
  "array.0": { fieldType: array, optional: false },
});

const arrayToSubgraph = (
  array: ValidatorJSON,
  subgraphNames: [string, ...string[]]
): string => {
  return objectToSubgraph(arrayToPretendObject(array), subgraphNames);
};

interface Node {
  name: string;
  type: ValidatorJSON["type"];
  ancestorNames: string[];
  linkedTableName?: string;
}
const flattenObjectFields = (
  object: Record<string, ObjectFieldType>,
  ancestorNames: string[]
): Node[] => {
  return Object.entries(object).flatMap(([name, { fieldType }]) => {
    switch (fieldType.type) {
      case "object":
        return flattenObjectFields(fieldType.value, [...ancestorNames, name]);
      case "union":
        return flattenUnionElements(fieldType.value, [...ancestorNames, name]);
      case "array":
        return flattenArrayElement(fieldType.value, [...ancestorNames, name]);
      default:
        return {
          name,
          type: fieldType.type,
          ancestorNames,
          ...(fieldType.type === "id" && {
            linkedTableName: fieldType.tableName,
          }),
        };
    }
  });
};
const flattenUnionElements = (
  union: ValidatorJSON[],
  ancestorNames: [...string[], string]
): Node[] => flattenObjectFields(unionToPretendObject(union), ancestorNames);

const flattenArrayElement = (
  array: ValidatorJSON,
  ancestorNames: [...string[], string]
): Node[] => flattenObjectFields(arrayToPretendObject(array), ancestorNames);
/**
 * Generate a Mermaid flowchart representation from a Convex schema.
 *
 * @param schema Convex schema (generated by `defineSchema`)
 * @returns Mermaid flowchart representation of the schema
 */
export const schemaToMermaid = (
  schema: SchemaDefinition<GenericSchema, any>
): string => {
  const subgraphs = Object.entries(schema.tables)
    .map(([tableName, _table]) => {
      const table = _table as unknown as TableDefinitionWithDocumentType;
      const documentType = table.documentType;

      // TODO: can we just use fieldTypeToNode here?
      switch (documentType.json.type) {
        case "object":
          return objectToSubgraph(documentType.json.value, [tableName]);

        case "union":
          return unionToSubgraph(documentType.json.value, [tableName]);

        default:
          throw new Error(
            "Only object and union table definition types are supported"
          );
      }
    })
    .join("");

  // TODO: some repeated code from above
  const links = Object.entries(schema.tables)
    .flatMap(([tableName, _table]) => {
      const table = _table as unknown as TableDefinitionWithDocumentType;
      const documentType = table.documentType;
      switch (documentType.json.type) {
        case "object":
          return flattenObjectFields(documentType.json.value, [tableName]);

        case "union":
          return flattenUnionElements(documentType.json.value, [tableName]);

        default:
          throw new Error(
            "Only object and union table definition types are supported"
          );
      }
    })
    .filter(({ type }) => type === "id")
    .map(
      // TODO: maybe linkedTableName could be statically guaranteed to exist
      ({ name, ancestorNames, linkedTableName }): string =>
        `  ${ancestorNames.join(".")}.${name}-->${linkedTableName}`
    )
    .join("\n");

  return `flowchart LR\n${subgraphs}${links}`;
};
