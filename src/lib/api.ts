import superagent from 'superagent';

import {
	ApiResponse, DataType, Device, DeviceApiResponse, EventType, MeasureApiResponse,
} from './api.types';

enum Api {
	Connect = 'https://account.withings.com/connectionwou/account_login',
	Devices = 'https://scalews.withings.com/cgi-bin/association',
	Measure = 'https://scalews.withings.com/cgi-bin/v2/measure',
}

export enum Measure {
	CarbonDioxide = 35,
	Temperature = 12,
}

const agent = superagent.agent();

const INVALID_PARAMS_ERROR = 'Invalid Params';
const TICK_INTERVAL = 15 * 60 * 1000; // tslint:disable-line:no-magic-numbers

export class WithingsApi {
	private device: Device;
	private battery: number;
	private carbondioxide: MeasureApiResponse['body']['series'][0]['data'][0];
	private temperature: MeasureApiResponse['body']['series'][0]['data'][0];

	private subscribers: Array<{ type: EventType, callback: (data: any) => void }> = [];
	private timer: NodeJS.Timeout;

	constructor(
		private readonly email: string,
		private readonly password: string,
		private readonly mac: string,
	) { }

	async init() {
		if (this.timer) {
			return;
		}

		this.timer = setInterval(() => this.tick(), TICK_INTERVAL);
		await this.tick();
	}

	getBatteryLevel() {
		return this.battery;
	}

	getDeviceInfo() {
		return this.device;
	}

	getCarbonDioxide() {
		return this.carbondioxide.value;
	}

	getTemperature() {
		return this.temperature.value;
	}

	on(type: DataType, callback: (data: number) => void): void;
	on(type: 'error', callback: (data: { message: string, error: Error }) => void): void;
	on(type: EventType, callback: (data: any) => void) {
		this.subscribers.push({ type, callback });
	}

	private async connect() {
		const query = await agent.post(Api.Connect)
			.field('email', this.email).field('password', this.password)
			.field('r', 'https://healthmate.withings.com/').field('is_admin', 'f')
		;
		const error = (query.text.replace(/[\n|\r|\t]/g, '').match(/<div class="alert alert-danger"><li>(.+?)<\/li><\/div>/) || [])[1];

		if (error) {
			throw new Error(`Connection failed (${error})`);
		}
	}

	private emit<T>(type: EventType, value: T) {
		this.subscribers
			.filter((subscriber) => subscriber.type === type)
			.forEach(({ callback }) => callback(value))
			;
	}

	private emitError(message: string, error: any) {
		this.emit<{ message: string, error: any }>('error', { message, error });
	}

	private async fetchDeviceInfo() {
		try {
			const query = await agent
				.post(Api.Devices)
				.field('action', 'getbyaccountid').field('enrich', 't')
			;

			const data = JSON.parse(query.text) as ApiResponse;
			if (data.status === 0) {
				this.device = (data as DeviceApiResponse).body.associations
					.find(({ deviceproperties }) => deviceproperties.macaddress.toUpperCase() === this.mac)
				;

				if (this.device) {
					return this.device;
				} else {
					throw new Error(`Could not find device with MAC ${this.mac}`);
				}
			} else {
				throw data.error;
			}
		} catch (e) {
			throw e;
		}
	}

	private async fetchMeasure(type: Measure) {
		try {
			const query = await agent
				.post(Api.Measure)
				.field('action', 'getmeashf').field('meastype', type).field('deviceid', this.device.deviceid)
			;

			const data = JSON.parse(query.text) as ApiResponse;
			if (data.status === 0) {
				const measure = (data as MeasureApiResponse).body.series[0].data[0];
				return measure;
			} else {
				throw data.error;
			}
		} catch (e) {
			throw e;
		}
	}

	private async reset() {
		this.device = null;
	}

	// tslint:disable-next-line:cyclomatic-complexity
	private async tick() {
		if (!this.device) {
			try {
				await this.connect();
			} catch (error) {
				this.emitError('Could not connect', error);
				return;
			}
		}

		try {
			const device = await this.fetchDeviceInfo();
			this.device = device;

			const battery = device.deviceproperties.batterylvl;
			(!this.battery || this.battery !== battery) && this.emit('battery', battery);
			this.battery = battery;

			const carbondioxide = await this.fetchMeasure(Measure.CarbonDioxide);
			(!this.carbondioxide || this.carbondioxide.date !== carbondioxide.date) && this.emit('carbondioxide', carbondioxide.value);
			this.carbondioxide = carbondioxide;

			const temperature = await this.fetchMeasure(Measure.Temperature);
			(!this.temperature || this.temperature.date !== temperature.date) && this.emit('temperature', temperature.value);
			this.temperature = temperature;
		} catch (error) {
			if (error === INVALID_PARAMS_ERROR) {
				this.emitError('Session expired. Will reconnect on next tick.', error);
				this.reset();
			} else {
				this.emitError('Could not fetch data from API', error);
			}
		}
	}
}
