import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { expect, test } from "vitest";
import { schemaToMermaid } from ".";

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
  subgraph messages
    messages.authorId[authorId: id 'users']
  end
  subgraph users
    users.name[name: string]
    users.age[age: number]
    users.teamId[teamId: id 'teams']
  end
  subgraph teams
    teams.name[name: string]
  end
  messages.authorId-->users
  users.teamId-->teams`;

  expect(schemaToMermaid(schema)).toBe(mermaid);
});
