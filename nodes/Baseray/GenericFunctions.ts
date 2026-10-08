import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	IN8nHttpFullResponse,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';

export const BASE_URL = 'https://api.baseray.ai/v1';

const API_ORIGIN = 'https://api.baseray.ai';

/** How often a request refused with `rate_limited` is retried after its Retry-After. */
const RATE_LIMIT_RETRIES = 3;

/** The longest Retry-After, in seconds, worth waiting for inside one execution. */
const MAX_RETRY_AFTER_SECONDS = 60;

interface BaserayError {
	code?: string;
	message?: string;
	parameter?: string;
}

function errorOf(body: unknown): BaserayError {
	if (body && typeof body === 'object' && 'error' in body) {
		const error = (body as { error: unknown }).error;
		if (error && typeof error === 'object') return error as BaserayError;
	}
	return {};
}

function header(headers: IDataObject, name: string): string | undefined {
	const value = headers[name] ?? headers[name.toLowerCase()];
	if (value === undefined || value === null) return undefined;
	return Array.isArray(value) ? String(value[0]) : String(value);
}

function hint(status: number, error: BaserayError, retryAfter: string | undefined): string {
	const wait = retryAfter ? ` Retry after ${retryAfter} seconds.` : '';
	switch (status) {
		case 400:
			return error.parameter
				? `The parameter "${error.parameter}" was refused. Check its value in the node.`
				: 'A parameter was refused. Check the node parameters.';
		case 401:
			return 'Check the API key in the baseray credential. Keys are created in the baseray app under Settings → API keys; a key stops working when it is revoked, expires or its creator leaves the workspace.';
		case 402:
			return 'The workspace has no credits left for these buildings. Every building returned costs one credit, except a building the workspace already paid for in the last 12 months. Add credits in the baseray app, or lower the limit.';
		case 403:
			return 'This API key may not do this.';
		case 404:
			return 'No building has this ID.';
		case 429:
			return error.code === 'quota_exceeded'
				? `All of a workspace's API keys together may make 5,000 requests a UTC day.${wait}`
				: `Each API key may make 60 requests a minute.${wait}`;
		case 503:
			return `The building catalogue is unavailable right now.${wait}`;
		default:
			return `baseray answered HTTP ${status}.`;
	}
}

/**
 * Resolves a `links.next` URL from the API. Only URLs on the API's own origin
 * are followed, so the API key is never sent anywhere else.
 */
export function nextPageUrl(next: unknown): string | undefined {
	if (typeof next !== 'string' || next === '') return undefined;
	if (next.startsWith(`${API_ORIGIN}/`)) return next;
	if (next.startsWith('/')) return `${API_ORIGIN}${next}`;
	return undefined;
}

/**
 * Makes one authenticated GET request to the baseray API and returns its JSON
 * body. Every non-2xx answer becomes a NodeApiError carrying the API's own
 * `error.message`; a `rate_limited` answer is retried after its Retry-After.
 */
export async function baserayApiRequest(
	this: IExecuteFunctions,
	pathOrUrl: string,
	qs: IDataObject,
	itemIndex: number,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method: 'GET',
		url: pathOrUrl.startsWith('https://') ? pathOrUrl : `${BASE_URL}${pathOrUrl}`,
		qs,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};

	for (let attempt = 0; ; attempt++) {
		const response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'baserayApi',
			options,
		)) as IN8nHttpFullResponse;
		const status = response.statusCode;
		const body = response.body as unknown;

		if (status >= 200 && status < 300) {
			return (body ?? {}) as IDataObject;
		}

		const error = errorOf(body);
		const headers = (response.headers ?? {}) as IDataObject;
		const retryAfter = header(headers, 'Retry-After');
		const retryAfterSeconds = Number(retryAfter);

		if (
			status === 429 &&
			error.code === 'rate_limited' &&
			attempt < RATE_LIMIT_RETRIES &&
			Number.isFinite(retryAfterSeconds) &&
			retryAfterSeconds >= 0 &&
			retryAfterSeconds <= MAX_RETRY_AFTER_SECONDS
		) {
			await sleep(Math.ceil(retryAfterSeconds) * 1000 + 250);
			continue;
		}

		const details: JsonObject = {
			httpCode: String(status),
			code: error.code ?? null,
			message: error.message ?? null,
			parameter: error.parameter ?? null,
		};
		throw new NodeApiError(this.getNode(), details, {
			message: error.message ?? `baseray answered HTTP ${status}`,
			description: hint(status, error, retryAfter),
			httpCode: String(status),
			itemIndex,
		});
	}
}
