# n8n-nodes-baseray

This is an [n8n](https://n8n.io/) community node for the [baseray API](https://baseray.ai/docs/api). It lets you search and read buildings in your n8n workflows: for every building baseray covers, its footprint, height, volume, floor area, floors, category, address and postcode, flood zone and seismic risk, what its record states (such as its construction year), rooftop solar potential, whether solar panels are already on the roof, and the businesses whose registered office is at its address. Each fact is marked measured, from a register, estimated or unknown. New countries are added continuously.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Credits](#credits) · [Errors and limits](#errors-and-limits) · [Compatibility](#compatibility) · [Resources](#resources)

## Installation

In n8n, go to **Settings → Community Nodes**, select **Install**, enter `n8n-nodes-baseray` and confirm. See the n8n [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for details, including installing from the command line on self-hosted n8n.

## Credentials

The node uses a **baseray API** credential holding a workspace API key.

1. In the baseray app, open **Settings → API keys** and create a key. It starts with `br_live_` and is shown once, so copy it then.
2. In n8n, create a **baseray API** credential and paste the key.

The key is sent as `Authorization: Bearer br_live_…`. A key stops working when it is revoked, when it expires, or when the person who created it leaves the workspace.

Saving the credential tests it with a request at a point far out in the Black Sea, so the test returns no building and costs no credits.

## Operations

Resource **Building**:

| Operation | API | What it returns |
| --- | --- | --- |
| **Search in Area** | `GET /v1/buildings` | One ranked page of the buildings inside a bounding box (`minLon,minLat,maxLon,maxLat`, each side at most 3 degrees) that pass every filter. Sort by volume, footprint area, height, registered-business turnover or employees. One item per building. |
| **Find at Point** | `GET /v1/buildings/at` | The buildings whose outline lies within a radius (1–200 m, default 25) of a latitude/longitude, nearest first, at most 25. One item per building. |
| **Get** | `GET /v1/buildings/{id}` | One building's full record, including dwellings, entrances and stated facts. A building the catalogue no longer holds comes back with `is_current` false and, where one now stands on its ground, `replaced_by_building_id`. |
| **Get Registered Businesses** | `GET /v1/buildings/{id}/registered-businesses` | The active businesses whose registered office is the building's exact official address, largest first, at most 25. One item per business. A registered office is never evidence of ownership or occupancy. |

**Search in Area** has a **Filters** collection with every filter of the API, generated from its [OpenAPI document](https://api.baseray.ai/v1/openapi.json) and keeping its descriptions: category, building type, roof shape, floors, dwellings, entrances, address corroboration, footprint area, height, volume, measured volume only, existing solar panels, solar potential (panel count, capacity, yearly energy, CO₂ savings), 3D model, registered businesses (name, turnover and its currency, financial year, employees), heating and thermal assessments, recent climate (frost days, hot days, coldest minimum, wettest day), flood zone and seismic risk class. Filters of different names combine with AND; the values of one list filter combine with OR.

A value baseray has no record of is `null`, meaning unknown, never zero, and a filter on a value leaves out buildings where it is unknown.

**Limit** sets the page size (default 25, at most 100) and **Offset** the buildings to skip; `offset + limit` may be at most 10,000. **Return All** follows each page's `links.next` until the last page, up to 10,000 buildings.

The node can also be used as a tool by n8n's AI Agent (on self-hosted n8n, an unverified community node needs `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`).

## Credits

**Every building the API returns costs the workspace one credit**, except a building the workspace already paid for in the last 12 months, which is free. This applies to Search in Area, Find at Point and Get. Keep **Limit** small and filters narrow, and use **Return All** only when you mean to pay for every matching building: it can return up to 10,000 buildings in one run.

## Errors and limits

Every error shows the API's own `error.message`, with a hint for the status:

- `401`: the API key is missing, invalid, revoked or expired.
- `402` (`insufficient_credits`): the workspace has no credits left for these buildings.
- `403`: the key may not do this, or its creator no longer belongs to the workspace.
- `404`: no building has this ID.
- `429` (`rate_limited`): each key may make 60 requests a minute. The node waits for the `Retry-After` the API gives (up to 60 seconds) and retries, up to 3 times.
- `429` (`quota_exceeded`): all of a workspace's keys together may make 5,000 requests a UTC day; the node does not retry.
- `503`: the building catalogue is unavailable right now; retry later.

Turn on the node's **Continue On Fail** setting to pass an error on as an item instead of stopping the workflow.

## Compatibility

Built with `@n8n/node-cli` 0.51 and `n8n-workflow` 2.42 (n8n nodes API version 1). It has no runtime dependencies.

## Development

```sh
npm install
npm run dev               # n8n on http://localhost:5678 with this node loaded
npm run lint
npm run build
npm run generate:filters  # regenerate the Filters collection from the live OpenAPI document
```

## Resources

- [baseray API documentation](https://baseray.ai/docs/api)
- [baseray OpenAPI document](https://api.baseray.ai/v1/openapi.json)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)
