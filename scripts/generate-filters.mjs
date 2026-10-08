#!/usr/bin/env node
// Generates nodes/Baseray/descriptions/BuildingFilters.ts from the baseray
// OpenAPI document: one "Filters" option per filter parameter of
// GET /buildings, keeping the spec's types, enums, bounds and descriptions.
//
// Usage:
//   node scripts/generate-filters.mjs                 # fetches the live spec
//   node scripts/generate-filters.mjs ./openapi.json  # reads a local copy
//
// `npm run generate:filters` runs it with the live spec, then prettier and
// `n8n-node lint --fix` (which drops the final period of one-sentence
// descriptions, as n8n's style wants).

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPEC_URL = 'https://api.baseray.ai/v1/openapi.json';
const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, '..', 'nodes', 'Baseray', 'descriptions', 'BuildingFilters.ts');

// Parameters of GET /buildings that the node exposes as top-level fields,
// not as filters.
const NOT_FILTERS = new Set(['bbox', 'sort', 'limit', 'offset']);

// Units such as m², kWp or °C stay out of display names (n8n's linter would
// title-case them); every filter's description states its unit.
const UNIT_SUFFIXES = ['_kg_per_year', '_m2', '_m3', '_kwp', '_kwh', '_mm', '_c', '_m'];

const WORDS = { co2: 'CO₂', '3d': '3D', min: 'Min', max: 'Max' };

// Enum values whose plain title-casing would read wrongly.
const VALUE_LABELS = {
	RsI: 'RsI',
	RsII: 'RsII',
	RsIII: 'RsIII',
	RsIV: 'RsIV',
	U1: 'U1',
	U2: 'U2',
	U3: 'U3',
	'100_year_climate_change': '100-Year (Climate Change)',
};

function titleWords(snake) {
	return snake
		.split('_')
		.filter(Boolean)
		.map((w) => WORDS[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

function displayName(param) {
	const suffix = UNIT_SUFFIXES.find((s) => param.endsWith(s));
	return titleWords(suffix ? param.slice(0, -suffix.length) : param);
}

function valueLabel(value) {
	if (VALUE_LABELS[value]) return VALUE_LABELS[value];
	const m = /^(\d+)_year$/.exec(value);
	if (m) return `${m[1]}-Year`;
	return titleWords(value);
}

function camel(snake) {
	return snake.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// The n8n UI renders descriptions as HTML, not Markdown.
function htmlDescription(text) {
	return text.replace(/`([^`]+)`/g, '<code>$1</code>');
}

function booleanDescription(text) {
	// n8n's linter wants boolean descriptions to start with "Whether".
	if (/^Keep /.test(text)) return 'Whether to keep ' + text.slice('Keep '.length);
	return 'Whether to apply this filter: ' + text;
}

function q(value) {
	return JSON.stringify(value);
}

function property(p) {
	const s = p.schema;
	const lines = [];
	const name = camel(p.name);
	lines.push(`\t{`);
	lines.push(`\t\tdisplayName: ${q(displayName(p.name))},`);
	lines.push(`\t\tname: ${q(name)},`);
	let description = htmlDescription(p.description);

	if (s.type === 'array' && s.items?.enum) {
		const options = [...s.items.enum]
			.map((v) => ({ name: valueLabel(v), value: v }))
			.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
		lines.push(`\t\ttype: 'multiOptions',`);
		lines.push(`\t\toptions: [`);
		for (const o of options) lines.push(`\t\t\t{ name: ${q(o.name)}, value: ${q(o.value)} },`);
		lines.push(`\t\t],`);
		lines.push(`\t\tdefault: [],`);
	} else if (s.type === 'array') {
		lines.push(`\t\ttype: 'string',`);
		lines.push(`\t\tdefault: '',`);
	} else if (s.type === 'boolean') {
		lines.push(`\t\ttype: 'boolean',`);
		lines.push(`\t\tdefault: ${s.default ?? false},`);
		description = booleanDescription(description);
	} else if (s.type === 'integer' || s.type === 'number') {
		lines.push(`\t\ttype: 'number',`);
		const typeOptions = [];
		if (s.minimum !== undefined) typeOptions.push(`minValue: ${s.minimum}`);
		if (s.maximum !== undefined) typeOptions.push(`maxValue: ${s.maximum}`);
		if (s.type === 'integer') typeOptions.push('numberPrecision: 0');
		if (typeOptions.length) lines.push(`\t\ttypeOptions: { ${typeOptions.join(', ')} },`);
		// A bound the user has just added starts at the value that keeps every
		// building: the lowest for a minimum, the highest for a maximum.
		const neutral = p.name.startsWith('max_') ? s.maximum : s.minimum;
		lines.push(`\t\tdefault: ${s.default ?? neutral ?? 0},`);
	} else {
		lines.push(`\t\ttype: 'string',`);
		lines.push(`\t\tdefault: '',`);
		if (p.example !== undefined) lines.push(`\t\tplaceholder: ${q(String(p.example))},`);
	}
	lines.push(`\t\tdescription: ${q(description)},`);
	lines.push(`\t},`);
	return { name, apiName: p.name, type: s.type, text: lines.join('\n') };
}

async function loadSpec(source) {
	if (source) return JSON.parse(await readFile(source, 'utf8'));
	const res = await fetch(SPEC_URL);
	if (!res.ok) throw new Error(`GET ${SPEC_URL} returned ${res.status}`);
	return res.json();
}

const spec = await loadSpec(process.argv[2]);
const params = spec.paths['/buildings'].get.parameters.filter(
	(p) => p.in === 'query' && !NOT_FILTERS.has(p.name),
);
const props = params
	.map(property)
	.sort((a, b) => displayName(a.apiName).localeCompare(displayName(b.apiName), 'en'));

const out = `// Generated by scripts/generate-filters.mjs from the baseray OpenAPI document
// (${SPEC_URL}, version ${spec.info.version}). Do not edit by hand: re-run the script.
import type { INodeProperties } from 'n8n-workflow';

/** Filter options of "Search in Area", one per filter parameter of GET /buildings. */
export const buildingFilterOptions: INodeProperties[] = [
${props.map((p) => p.text).join('\n')}
];

/** Maps each filter option to its query parameter in the baseray API. */
export const buildingFilterQueryNames: Record<string, string> = {
${props.map((p) => `\t${p.name}: ${q(p.apiName)},`).join('\n')}
};

/** Filters that take several values, sent as a comma list. */
export const buildingListFilters: string[] = [
${props
	.filter((p) => p.type === 'array')
	.map((p) => `\t${q(p.name)},`)
	.join('\n')}
];
`;

await writeFile(outFile, out);
console.log(`Wrote ${props.length} filters to ${outFile}`);
