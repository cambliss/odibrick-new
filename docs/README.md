# Odibrick documentation

| Document | Read it when |
| --- | --- |
| [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) | **Start here.** Local setup, clearing the first-build errors, modification recipes, and hosting on a VPS end to end. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | You want to understand how the pieces fit — layering, module map, the tenancy state machine, the design language. |
| [DATABASE.md](DATABASE.md) | You are working with the schema. ERD, conventions, indexing notes, the seed dataset. |
| [API.md](API.md) | You are calling or extending the API. Every endpoint, with its access requirement. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | You are putting it on a server. Step by step, plus rollback and scaling. |
| [SECURITY.md](SECURITY.md) | Before you go live. What is protected, what is not, and the known gaps. |
| [RBAC.md](RBAC.md) | You are assigning roles or adding a permission check. |
| [user-guides/](user-guides/) | End-user PDFs, one per role — tenant, owner, agent & builder, legal, verification, administration. Regenerate them with `tools/guide-generator`. |

Start with the [root README](../README.md) for the project overview and quick start.

## A note on the state of this code

None of it has been compiled or run. Expect to spend an afternoon fixing TypeScript
errors on the first build. The architecture and SQL are sound; the compiler has not
yet had its say. See the "Known gaps" section of [SECURITY.md](SECURITY.md) for the
full list of what is missing before this is production-ready.
