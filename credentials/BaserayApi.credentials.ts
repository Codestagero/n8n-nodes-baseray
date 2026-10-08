import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class BaserayApi implements ICredentialType {
	name = 'baserayApi';

	// eslint-disable-next-line n8n-nodes-base/cred-class-field-display-name-miscased -- the brand is written in lowercase
	displayName = 'baseray API';

	icon: Icon = {
		light: 'file:../nodes/Baseray/baseray.svg',
		dark: 'file:../nodes/Baseray/baseray.dark.svg',
	};

	documentationUrl = 'https://baseray.ai/docs/api';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'A workspace API key, created in the baseray app under Settings → API keys. It starts with <code>br_live_</code>.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// A point far out in the Black Sea, with the smallest radius: the key is
	// checked, no building is returned, so the test costs no credits.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.baseray.ai/v1',
			url: '/buildings/at',
			method: 'GET',
			qs: {
				lat: 43.5,
				lon: 31,
				radius_m: 1,
				limit: 1,
			},
		},
	};
}
