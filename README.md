# convex-schema-mermaid

Generate a Mermaid flowchart from a Convex schema

```ts
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
console.log(schemaToMermaid(schema));

// flowchart LR
//   subgraph messages
//     messages.authorId[authorId: id 'users']
//   end
//   subgraph users
//     users.name[name: string]
//     users.age[age: number]
//     users.teamId[teamId: id 'teams']
//   end
//   subgraph teams
//     teams.name[name: string]
//   end
//   messages.authorId-->users
//   users.teamId-->teams
```
