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

/** append a `?` to the field name if it is optional */
const fieldNameToSubgraphName = (fieldName: string, optional: boolean) =>
  optional ? `${fieldName}?` : fieldName;

const literalToNode = (fieldName: string, value: JSONValue) =>
  `${fieldToNode(fieldName, "literal")} '${value}'`;

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
  switch (fieldType.type) {
    case "object":
      return objectToSubgraph(fieldType.value, [...subgraphNames, fieldName]);
    case "union":
      return unionToSubgraph(fieldType.value, [...subgraphNames, fieldName]);
    case "array":
      return arrayToSubgraph(fieldType.value, [...subgraphNames, fieldName]);
    case "literal":
      return literalToNode(fieldName, fieldType.value);
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
 * @param ancestorNames a list of subgraph ancestor names
 * @returns a mermaid subgraph representation of the object
 */
const objectToSubgraph = (
  object: Record<string, ObjectFieldType>,
  ancestorNames: [string, ...string[]]
): string => {
  const fieldNodes = Object.entries(object)
    .map(([fieldName, { fieldType, optional }]) => {
      const subgraphName = fieldNameToSubgraphName(fieldName, optional);
      const node = fieldTypeToNode(subgraphName, fieldType, ancestorNames);
      if (
        fieldType.type === "object" ||
        fieldType.type === "union" ||
        fieldType.type === "array"
      ) {
        // don't wrap with []
        return node;
      }
      return `${ancestorNames.join(".")}.${subgraphName}[${node}]`;
    })
    .join("\n");

  return [
    `subgraph ${ancestorNames.join(".")}[${ancestorNames.at(-1)}]`,
    `${fieldNodes}`,
    `end\n`,
  ].join("\n");
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

/**
 * Generate a Mermaid subgraph representation of a union.
 */
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

/**
 * Generate a Mermaid subgraph representation of an array.
 */
const arrayToSubgraph = (
  array: ValidatorJSON,
  subgraphNames: [string, ...string[]]
): string => {
  return objectToSubgraph(arrayToPretendObject(array), subgraphNames);
};

/**
 * A node in the Mermaid flowchart representation of a schema.
 */
interface Node {
  name: string;
  type: ValidatorJSON["type"];
  ancestorNames: string[];
  /** defined iff this is a link node */
  linkedTableName?: string;
}

/**
 * Return a list of all fields nested in an object as nodes.
 */
const flattenObjectFields = (
  object: Record<string, ObjectFieldType>,
  ancestorNames: string[]
): Node[] => {
  return Object.entries(object).flatMap(
    ([fieldName, { fieldType, optional }]): Node[] => {
      const name = fieldNameToSubgraphName(fieldName, optional);
      switch (fieldType.type) {
        case "object":
          return flattenObjectFields(fieldType.value, [...ancestorNames, name]);
        case "union":
          return flattenUnionElements(fieldType.value, [
            ...ancestorNames,
            name,
          ]);
        case "array":
          return flattenArrayElement(fieldType.value, [...ancestorNames, name]);
        default:
          return [
            {
              name,
              type: fieldType.type,
              ancestorNames,
              ...(fieldType.type === "id" && {
                linkedTableName: fieldType.tableName,
              }),
            },
          ];
      }
    }
  );
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

      switch (documentType.json.type) {
        case "object":
          return objectToSubgraph(documentType.json.value, [tableName]);

        case "union":
          return unionToSubgraph(documentType.json.value, [tableName]);

        default:
          throw new Error(
            "Only object and union table definition types are supported, " +
              `but ${tableName} has type ${documentType.json.type}`
          );
      }
    })
    .join("");

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
            "Only object and union table definition types are supported, " +
              `but ${tableName} has type ${documentType.json.type}`
          );
      }
    })
    .filter(({ type }) => type === "id")
    .map(
      // TODO: maybe linkedTableName could be statically guaranteed to exist
      ({ name, ancestorNames, linkedTableName }): string =>
        `${ancestorNames.join(".")}.${name}-->${linkedTableName}`
    )
    .join("\n");

  return applyIndentation([`flowchart LR`, `${subgraphs}${links}`].join("\n"));
};

/**
 * Indents subgraphs by 2 spaces for each level of nesting and removes empty
 * lines.
 *
 * @param mermaidStr string representation of a mermaid flowchart
 * @returns mermaid flowchart string with indentation applied
 */
const applyIndentation = (mermaidStr: string) => {
  const lines = mermaidStr.split("\n");
  let indents = 0;
  const indentedLines = [];
  for (const line of lines) {
    if (!line) {
      continue;
    }
    if (line.startsWith("flowchart") || line.startsWith("subgraph")) {
      indentedLines.push(" ".repeat(indents) + line);
      indents += 2;
    } else if (line.startsWith("end")) {
      indents -= 2;
      indentedLines.push(" ".repeat(indents) + line);
    } else {
      indentedLines.push(" ".repeat(indents) + line);
    }
  }
  return indentedLines.join("\n");
};
