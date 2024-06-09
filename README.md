# convex-schema-mermaid

Generate a Mermaid flowchart from a Convex schema

Install the package from NPM:

```sh
npm i convex-schema-mermaid
```

Import the `schemaToMermaid` and pass in your schema:

```ts
import { schemaToMermaid } from "convex-schema-mermaid";

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

To use with your Convex project, you can place the `console.log(schemaToMermaid(schema))` inside a Convex function and then run that function from the Convex dashboard.

You can also run this one-liner from the root directory of your project, which will bundle and run your schema with a script to print the mermaid output:

```sh
echo "import s from './convex/schema';import {schemaToMermaid} from 'convex-schema-mermaid';console.log(schemaToMermaid(s))" | npx esbuild --bundle | node
```
