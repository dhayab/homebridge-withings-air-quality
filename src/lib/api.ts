import superagent from 'superagent';

import { ApiResponse, Data, Device, DeviceApiResponse, MeasureApiResponse } from './api.types';

enum Api {
	Connect = 'https://account.withings.com/connectionuser/account_login',
	Devices = 'https://scalews.withings.com/cgi-bin/association',
	Measure = 'https://scalews.withings.com/cgi-bin/v2/measure',
}

export enum Measure {
	CarbonDioxide = 35,
	Temperature = 12,
}

const agent = superagent.agent();

const TICK_INTERVAL = 5 * 60 * 1000; // tslint:disable-line:no-magic-numbers

export class WithingsApi {
	private device: Device;
	private subscribers: Array<{ type: Data, callback: (data: any) => void }> = [];
	private tick: NodeJS.Timeout;

	constructor(
		private readonly email: string,
		private readonly password: string,
		private readonly mac: string,
	) {}

	async connect() {
		await this.authenticate();

		if (!this.tick) {
			this.tick = setInterval(() => {
				Promise.all([
					this.authenticate(),
					this.getDeviceInfo(),
					this.getMeasure(Measure.CarbonDioxide),
					this.getMeasure(Measure.Temperature),
				]).then(([_, device, co2, temperature]) => {
					this.emit<Device>('device', device);
					this.emit<number>('carbondioxide', co2);
					this.emit<number>('temperature', temperature);
				});
			}, TICK_INTERVAL);
		}

		return await this.getDeviceInfo();
	}

	async getDeviceInfo() {
		try {
			const query = await agent
				.post(Api.Devices)
				.field('action', 'getbyaccountid').field('enrich', 't')
			;

			const data = JSON.parse(query.text) as ApiResponse;
			if (data.status === 0) {
				this.device = (data as DeviceApiResponse).body.associations
					.find(({ deviceproperties }) => deviceproperties.macaddress.replace(/:/g, '') === this.mac)
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

	async getMeasure(type: Measure) {
		try {
			const query = await agent
				.post(Api.Measure)
				.field('action', 'getmeashf').field('meastype', type).field('deviceid', this.device.deviceid)
			;

			const data = JSON.parse(query.text) as ApiResponse;
			if (data.status === 0) {
				const measure = (data as MeasureApiResponse).body.series[0].data[0];
				return measure.value;
			} else {
				throw data.error;
			}
		} catch (e) {
			throw e;
		}
	}

	on(type: 'carbondioxide' | 'temperature', callback: (data: number) => void): void;
	on(type: 'device', callback: (data: Device) => void): void;
	on(type: Data, callback: (data: any) => void) {
		this.subscribers.push({ type, callback });
	}

	private async authenticate() {
		const query = await agent.post(Api.Connect).field('email', this.email).field('password', this.password);
		const error = (query.text.replace(/[\n|\r|\t]/g, '').match(/<div class="alert alert-danger"><li>(.+?)<\/li><\/div>/) || [])[1];

		if (error) {
			throw new Error(`Connection failed (${error})`);
		}
	}

	private emit<T>(type: Data, value: T) {
		this.subscribers
			.filter((subscriber) => subscriber.type === type)
			.forEach(({ callback }) => callback(value))
		;
	}
}
