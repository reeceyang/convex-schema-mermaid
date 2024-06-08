import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { expect, test } from "vitest";
import { schemaToMermaid } from ".";

// These are all essentially snapshot tests at the moment

test("schemaToMermaid", () => {
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

test.todo("table defined as union of objects", () => {
  const schema = defineSchema({
    test: defineTable(
      v.union(v.object({ name: v.string() }), v.object({ age: v.number() }))
    ),
  });
});

test.todo("nested objects with link fields", () => {
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
});
