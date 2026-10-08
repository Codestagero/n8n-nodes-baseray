import type { INodeProperties } from 'n8n-workflow';
import { buildingFilterOptions } from './BuildingFilters';

const CREDIT_NOTE =
	'Every building returned costs the workspace one credit, except a building it already paid for in the last 12 months.';

export const buildingOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['building'] } },
		options: [
			{
				name: 'Find at Point',
				value: 'findAtPoint',
				description:
					'Find the buildings whose outline lies within a radius of a point, nearest first',
				action: 'Find buildings at a point',
			},
			{
				name: 'Get',
				value: 'get',
				description: "Get one building's record",
				action: 'Get a building',
			},
			{
				name: 'Get Registered Businesses',
				value: 'getRegisteredBusinesses',
				description:
					"Get the active businesses whose registered office is the building's exact official address",
				action: 'Get the businesses registered at a building',
			},
			{
				name: 'Search in Area',
				value: 'search',
				description: 'Search the buildings inside a bounding box that pass every filter, ranked',
				action: 'Search buildings in an area',
			},
		],
		default: 'search',
	},
];

const show = (operation: string[], extra: Record<string, boolean[]> = {}) => ({
	show: { resource: ['building'], operation, ...extra },
});

export const buildingFields: INodeProperties[] = [
	{
		displayName: CREDIT_NOTE,
		name: 'creditNotice',
		type: 'notice',
		default: '',
		displayOptions: show(['search', 'findAtPoint', 'get']),
	},
	// ----------------------------------------
	//          building: search
	// ----------------------------------------
	{
		displayName: 'Bounding Box',
		name: 'bbox',
		type: 'string',
		required: true,
		default: '',
		placeholder: '25.55,45.60,25.68,45.70',
		displayOptions: show(['search']),
		description:
			'The area to search: <code>minLon,minLat,maxLon,maxLat</code> in WGS84 degrees. Each side may span at most 3 degrees; search a county, city or district. Buildings are covered in Romania and Czechia.',
	},
	{
		displayName: 'Sort',
		name: 'sort',
		type: 'options',
		displayOptions: show(['search']),
		options: [
			{
				name: 'Area',
				value: 'area',
				description: 'Footprint, m²',
			},
			{
				name: 'Height',
				value: 'height',
				description: 'Height, m',
			},
			{
				name: 'Registered Business Employees',
				value: 'registered_business_employees',
				description:
					'The largest stated size of a business registered at the address; a band ranks where it starts, so 10–19 ranks as 10',
			},
			{
				name: 'Registered Business Turnover',
				value: 'registered_business_turnover',
				description:
					'The largest latest turnover of a business registered at the address, in the Registered Business Turnover Currency filter, which it requires',
			},
			{
				name: 'Volume',
				value: 'volume',
				description: 'Volume, m³',
			},
		],
		default: 'volume',
		description: 'Ranking, largest first',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		displayOptions: show(['search']),
		default: false,
		// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-return-all -- it must warn that every building costs a credit
		description: `Whether to return every matching building (up to 10,000), following each next page. ${CREDIT_NOTE} Returning all can spend many credits; prefer narrow filters and a limit.`,
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		displayOptions: show(['search'], { returnAll: [false] }),
		typeOptions: { minValue: 1, maxValue: 100 },
		// eslint-disable-next-line n8n-nodes-base/node-param-default-wrong-for-limit -- every building costs a credit, so the default page stays small (the API's own default)
		default: 25,
		description: 'Max number of results to return',
	},
	{
		displayName: 'Offset',
		name: 'offset',
		type: 'number',
		displayOptions: show(['search'], { returnAll: [false] }),
		typeOptions: { minValue: 0, maxValue: 10000, numberPrecision: 0 },
		default: 0,
		description:
			'Buildings to skip, for the next page. Offset plus limit must be at most 10,000; past that, narrow the bounding box.',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show(['search']),
		description:
			'Filters of different names combine with AND; the values of one list filter combine with OR',
		options: buildingFilterOptions,
	},

	// ----------------------------------------
	//          building: findAtPoint
	// ----------------------------------------
	{
		displayName: 'Latitude',
		name: 'lat',
		type: 'number',
		required: true,
		displayOptions: show(['findAtPoint']),
		typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 6 },
		default: 0,
		placeholder: '45.64988',
		description: 'Latitude of the point, WGS84',
	},
	{
		displayName: 'Longitude',
		name: 'lon',
		type: 'number',
		required: true,
		displayOptions: show(['findAtPoint']),
		typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 6 },
		default: 0,
		placeholder: '25.61044',
		description: 'Longitude of the point, WGS84',
	},
	{
		displayName: 'Radius',
		name: 'radiusM',
		type: 'number',
		displayOptions: show(['findAtPoint']),
		typeOptions: { minValue: 1, maxValue: 200 },
		default: 25,
		description: 'How far from the point to look, in metres',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		displayOptions: show(['findAtPoint']),
		typeOptions: { minValue: 1, maxValue: 25 },
		// eslint-disable-next-line n8n-nodes-base/node-param-default-wrong-for-limit -- the API's own default; its maximum here is 25
		default: 10,
		description: 'Max number of results to return',
	},

	// ----------------------------------------
	//  building: get, getRegisteredBusinesses
	// ----------------------------------------
	{
		displayName: 'Building ID',
		name: 'buildingId',
		type: 'string',
		required: true,
		displayOptions: show(['get', 'getRegisteredBusinesses']),
		default: '',
		placeholder: 'c9eefd1b-8c8d-48fe-8b72-e015374d7720',
		description: "The building's baseray ID, a UUID returned by the other building operations",
	},
];
