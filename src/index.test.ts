import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { expect, test } from "vitest";
import { schemaToMermaid } from ".";

// These are all essentially snapshot tests

test("tables with no nested objects", () => {
  const schema = defineSchema({
    messages: defineTable({
      authorId: v.id("users"),
    }),
    users: defineTable({
      name: v.string(),
      age: v.number(),
      teamId: v.id("teams"),
    }),
    teams: defineTable({
      name: v.string(),
    }),
  });
  const mermaid = `flowchart LR
  subgraph messages[messages]
    messages.authorId[authorId: id 'users']
  end
  subgraph users[users]
    users.name[name: string]
    users.age[age: number]
    users.teamId[teamId: id 'teams']
  end
  subgraph teams[teams]
    teams.name[name: string]
  end
  messages.authorId-->users
  users.teamId-->teams`;

  expect(schemaToMermaid(schema)).toBe(mermaid);
});

test("table defined as union of objects", () => {
  const schema = defineSchema({
    test: defineTable(
      v.union(v.object({ name: v.string() }), v.object({ age: v.number() }))
    ),
  });

  const mermaid = `flowchart LR
  subgraph test[test]
    subgraph test.union.0[union.0]
      test.union.0.name[name: string]
    end
    subgraph test.union.1[union.1]
      test.union.1.age[age: number]
    end
  end`;

  expect(schemaToMermaid(schema)).toBe(mermaid);
});

test("nested objects with link fields", () => {
  const schema = defineSchema({
    a: defineTable({
      object1: v.object({
        object2: v.object({
          bId: v.id("b"),
        }),
        bId: v.id("b"),
      }),
    }),
    b: defineTable({}),
  });

  const mermaid = `flowchart LR
  subgraph a[a]
    subgraph a.object1[object1]
      subgraph a.object1.object2[object2]
        a.object1.object2.bId[bId: id 'b']
      end
      a.object1.bId[bId: id 'b']
    end
  end
  subgraph b[b]
  end
  a.object1.object2.bId-->b
  a.object1.bId-->b`;

  expect(schemaToMermaid(schema)).toBe(mermaid);
});

test("nested union of literals", () => {
  const schema = defineSchema({
    filterExpressions: defineTable(
      v.union(
        v.object({
          type: v.literal("and"),
          filters: v.array(v.id("filterExpressions")),
        }),
        v.object({
          type: v.literal("or"),
          filters: v.array(v.id("filterExpressions")),
        }),
        v.object({
          type: v.literal("where"),
          fieldId: v.id("firestoreFields"),
          operator: v.union(v.literal("=="), v.literal("not-in")),
          value: v.any(),
        })
      )
    ),
  });
  const mermaid = `flowchart LR
  subgraph filterExpressions[filterExpressions]
    subgraph filterExpressions.union.0[union.0]
      filterExpressions.union.0.type[type: literal 'and']
      subgraph filterExpressions.union.0.filters[filters]
        filterExpressions.union.0.filters.array.0[array.0: id 'filterExpressions']
      end
    end
    subgraph filterExpressions.union.1[union.1]
      filterExpressions.union.1.type[type: literal 'or']
      subgraph filterExpressions.union.1.filters[filters]
        filterExpressions.union.1.filters.array.0[array.0: id 'filterExpressions']
      end
    end
    subgraph filterExpressions.union.2[union.2]
      filterExpressions.union.2.type[type: literal 'where']
      filterExpressions.union.2.fieldId[fieldId: id 'firestoreFields']
      subgraph filterExpressions.union.2.operator[operator]
        filterExpressions.union.2.operator.union.0[union.0: literal '==']
        filterExpressions.union.2.operator.union.1[union.1: literal 'not-in']
      end
      filterExpressions.union.2.value[value: any]
    end
  end
  filterExpressions.union.0.filters.array.0-->filterExpressions
  filterExpressions.union.1.filters.array.0-->filterExpressions
  filterExpressions.union.2.fieldId-->firestoreFields`;

  expect(schemaToMermaid(schema)).toBe(mermaid);
});

test("array with linked tables", () => {
  const schema = defineSchema({
    a: defineTable({
      field1: v.array(v.id("b")),
      field2: v.array(v.object({ bId: v.id("b") })),
    }),
    b: defineTable({}),
  });

  const mermaid = `flowchart LR
  subgraph a[a]
    subgraph a.field1[field1]
      a.field1.array.0[array.0: id 'b']
    end
    subgraph a.field2[field2]
      subgraph a.field2.array.0[array.0]
        a.field2.array.0.bId[bId: id 'b']
      end
    end
  end
  subgraph b[b]
  end
  a.field1.array.0-->b
  a.field2.array.0.bId-->b`;

  expect(schemaToMermaid(schema)).toBe(mermaid);
});

test("optional link and object fields", () => {
  const schema = defineSchema({
    a: defineTable({
      field1: v.optional(v.id("b")),
      field2: v.optional(v.object({ bId: v.id("b") })),
    }),
    b: defineTable({}),
  });

  const mermaid = `flowchart LR
  subgraph a[a]
    a.field1?[field1?: id 'b']
    subgraph a.field2?[field2?]
      a.field2?.bId[bId: id 'b']
    end
  end
  subgraph b[b]
  end
  a.field1?-->b
  a.field2?.bId-->b`;

  expect(schemaToMermaid(schema)).toBe(mermaid);
});

test("no typescript errors for strict table name types", () => {
  defineSchema({}, { strictTableNameTypes: false });
});
