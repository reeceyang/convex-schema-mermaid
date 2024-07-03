import { GenericSchema, SchemaDefinition } from "convex/server";
import { JSONValue, OptionalProperty, Validator } from "convex/values";

/** append a `?` to the field name if it is optional */
const fieldNameToSubgraphName = (
  fieldName: string,
  optional: OptionalProperty
) => (optional === "optional" ? `${fieldName}?` : fieldName);

const literalToNode = (fieldName: string, value: JSONValue) =>
  `${fieldToNode(fieldName, "literal")} '${value}'`;

const fieldToNode = (fieldName: string, fieldType: string) =>
  `${fieldName}: ${fieldType}`;

const linkFieldToNode = (fieldName: string, tableName: string) =>
  `${fieldToNode(fieldName, "id")} '${tableName}'`;

/** converts a field validator to a node */
const fieldValidatorToNode = (
  fieldName: string,
  fieldValidator: Validator<any, OptionalProperty, any>,
  subgraphNames: [string, ...string[]]
) => {
  switch (fieldValidator.kind) {
    case "object":
      return objectToSubgraph(fieldValidator.fields, [
        ...subgraphNames,
        fieldName,
      ]);
    case "union":
      return unionToSubgraph(fieldValidator.members, [
        ...subgraphNames,
        fieldName,
      ]);
    case "array":
      return arrayToSubgraph(fieldValidator.element, [
        ...subgraphNames,
        fieldName,
      ]);
    case "literal":
      return literalToNode(fieldName, fieldValidator.value);
    case "id":
      return linkFieldToNode(fieldName, fieldValidator.tableName);
    default:
      return fieldToNode(fieldName, fieldValidator.kind);
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
  object: Record<string, Validator<any, OptionalProperty, any>>,
  ancestorNames: [string, ...string[]]
): string => {
  const fieldNodes = Object.entries(object)
    .map(([fieldName, fieldValidator]) => {
      const subgraphName = fieldNameToSubgraphName(
        fieldName,
        fieldValidator.isOptional
      );
      const node = fieldValidatorToNode(
        subgraphName,
        fieldValidator,
        ancestorNames
      );
      if (
        fieldValidator.kind === "object" ||
        fieldValidator.kind === "union" ||
        fieldValidator.kind === "array"
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
  unionMembers: Validator<any, OptionalProperty, any>[]
): Record<string, Validator<any, OptionalProperty, any>> =>
  Object.fromEntries(
    unionMembers.map((validator, i) => [`union.${i}`, validator])
  );

/**
 * Generate a Mermaid subgraph representation of a union.
 */
const unionToSubgraph = (
  unionMembers: Validator<any, OptionalProperty, any>[],
  subgraphNames: [string, ...string[]]
): string => {
  return objectToSubgraph(unionToPretendObject(unionMembers), subgraphNames);
};

/**
 * Pretend an array is an object with a field named `array.0`
 */
const arrayToPretendObject = (
  arrayElement: Validator<any, OptionalProperty, any>
): Record<string, Validator<any, OptionalProperty, any>> => ({
  "array.0": arrayElement,
});

/**
 * Generate a Mermaid subgraph representation of an array.
 */
const arrayToSubgraph = (
  arrayElement: Validator<any, OptionalProperty, any>,
  subgraphNames: [string, ...string[]]
): string => {
  return objectToSubgraph(arrayToPretendObject(arrayElement), subgraphNames);
};

/**
 * A node in the Mermaid flowchart representation of a schema.
 */
interface Node {
  name: string;
  kind: Validator<any, OptionalProperty, any>["kind"];
  ancestorNames: string[];
  /** defined iff this is a link node */
  linkedTableName?: string;
}

/**
 * Return a list of all fields nested in an object as nodes.
 */
const flattenObjectFields = (
  object: Record<string, Validator<any, OptionalProperty, any>>,
  ancestorNames: string[]
): Node[] => {
  return Object.entries(object).flatMap(([fieldName, validator]): Node[] => {
    const name = fieldNameToSubgraphName(fieldName, validator.isOptional);
    switch (validator.kind) {
      case "object":
        return flattenObjectFields(validator.fields, [...ancestorNames, name]);
      case "union":
        return flattenUnionMembers(validator.members, [...ancestorNames, name]);
      case "array":
        return flattenArrayElement(validator.element, [...ancestorNames, name]);
      default:
        return [
          {
            name,
            kind: validator.kind,
            ancestorNames,
            ...(validator.kind === "id" && {
              linkedTableName: validator.tableName,
            }),
          },
        ];
    }
  });
};

const flattenUnionMembers = (
  unionMembers: Validator<any, OptionalProperty, any>[],
  ancestorNames: [...string[], string]
): Node[] =>
  flattenObjectFields(unionToPretendObject(unionMembers), ancestorNames);

const flattenArrayElement = (
  arrayElement: Validator<"array", any, any>,
  ancestorNames: [...string[], string]
): Node[] =>
  flattenObjectFields(arrayToPretendObject(arrayElement), ancestorNames);

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
    .map(([tableName, table]) => {
      const tableValidator = table.validator;

      switch (tableValidator.kind) {
        case "object":
          return objectToSubgraph(tableValidator.fields, [tableName]);

        case "union":
          return unionToSubgraph(tableValidator.members, [tableName]);

        default:
          throw new Error(
            "Only object and union table definition types are supported, " +
              `but ${tableName} has type ${tableValidator.kind}`
          );
      }
    })
    .join("");

  const links = Object.entries(schema.tables)
    .flatMap(([tableName, table]) => {
      const tableValidator = table.validator;

      switch (tableValidator.kind) {
        case "object":
          return flattenObjectFields(tableValidator.fields, [tableName]);

        case "union":
          return flattenUnionMembers(tableValidator.members, [tableName]);

        default:
          throw new Error(
            "Only object and union table definition types are supported, " +
              `but ${tableName} has type ${tableValidator.kind}`
          );
      }
    })
    .filter(({ kind: type }) => type === "id")
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
