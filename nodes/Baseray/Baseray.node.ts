import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { buildingFields, buildingOperations } from './descriptions/BuildingDescription';
import { buildingFilterQueryNames, buildingListFilters } from './descriptions/BuildingFilters';
import { baserayApiRequest, nextPageUrl } from './GenericFunctions';

/** The largest page GET /buildings serves. */
const MAX_PAGE_SIZE = 100;

function filterQuery(filters: IDataObject): IDataObject {
	const qs: IDataObject = {};
	for (const [option, value] of Object.entries(filters)) {
		const param = buildingFilterQueryNames[option];
		if (!param || value === undefined || value === null || value === '') continue;
		if (buildingListFilters.includes(option)) {
			// The API takes a comma list for every list filter.
			const values = Array.isArray(value)
				? value.map((v) => String(v).trim())
				: String(value)
						.split(',')
						.map((v) => v.trim());
			const list = values.filter((v) => v !== '');
			if (list.length) qs[param] = list.join(',');
			continue;
		}
		qs[param] = value;
	}
	return qs;
}

export class Baseray implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'baseray',
		name: 'baseray',
		icon: { light: 'file:baseray.svg', dark: 'file:baseray.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Search and read buildings in Romania and Czechia from the baseray API: footprint, height, volume, floors, address, solar potential, natural hazards and registered businesses',
		defaults: {
			name: 'baseray',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'baserayApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Building',
						value: 'building',
					},
				],
				default: 'building',
			},
			...buildingOperations,
			...buildingFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource !== 'building') {
					throw new NodeOperationError(this.getNode(), `Unknown resource "${resource}"`, {
						itemIndex: i,
					});
				}

				let results: IDataObject[];

				if (operation === 'search') {
					results = await searchBuildings.call(this, i);
				} else if (operation === 'findAtPoint') {
					const response = await baserayApiRequest.call(
						this,
						'/buildings/at',
						{
							lat: this.getNodeParameter('lat', i) as number,
							lon: this.getNodeParameter('lon', i) as number,
							radius_m: this.getNodeParameter('radiusM', i) as number,
							limit: this.getNodeParameter('limit', i) as number,
						},
						i,
					);
					results = (response.data as IDataObject[]) ?? [];
				} else if (operation === 'get') {
					const id = encodeURIComponent((this.getNodeParameter('buildingId', i) as string).trim());
					const response = await baserayApiRequest.call(this, `/buildings/${id}`, {}, i);
					results = [(response.data as IDataObject) ?? {}];
				} else if (operation === 'getRegisteredBusinesses') {
					const id = encodeURIComponent((this.getNodeParameter('buildingId', i) as string).trim());
					const response = await baserayApiRequest.call(
						this,
						`/buildings/${id}/registered-businesses`,
						{},
						i,
					);
					results = (response.data as IDataObject[]) ?? [];
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, {
						itemIndex: i,
					});
				}

				for (const result of results) {
					returnData.push({ json: result, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Re-wrapping a NodeApiError or NodeOperationError hands back the original.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

async function searchBuildings(this: IExecuteFunctions, i: number): Promise<IDataObject[]> {
	const returnAll = this.getNodeParameter('returnAll', i) as boolean;
	const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

	const qs: IDataObject = {
		bbox: (this.getNodeParameter('bbox', i) as string).replace(/\s+/g, ''),
		sort: this.getNodeParameter('sort', i) as string,
		...filterQuery(filters),
	};

	if (!returnAll) {
		qs.limit = this.getNodeParameter('limit', i) as number;
		qs.offset = this.getNodeParameter('offset', i) as number;
		const response = await baserayApiRequest.call(this, '/buildings', qs, i);
		return (response.data as IDataObject[]) ?? [];
	}

	qs.limit = MAX_PAGE_SIZE;
	qs.offset = 0;
	const buildings: IDataObject[] = [];
	let response: IDataObject = await baserayApiRequest.call(this, '/buildings', qs, i);
	for (;;) {
		buildings.push(...((response.data as IDataObject[]) ?? []));
		const rawNext = (response.links as IDataObject | undefined)?.next;
		if (rawNext === undefined || rawNext === null) break;
		const next = nextPageUrl(rawNext);
		if (next) {
			// The next page's URL carries every query parameter itself.
			response = await baserayApiRequest.call(this, next, {}, i);
		} else {
			// A next page on another origin is never followed with the API key;
			// ask the API for the same page by offset instead.
			const meta = (response.meta as IDataObject | undefined) ?? {};
			const offset: number = Number(meta.offset ?? qs.offset) + Number(meta.limit ?? qs.limit);
			qs.offset = offset;
			response = await baserayApiRequest.call(this, '/buildings', qs, i);
		}
	}
	return buildings;
}
