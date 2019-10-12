import * as Hap from 'hap-nodejs';

import pkg from '../package.json';
import { WithingsApi } from './lib/api';
import { DataType } from './lib/api.types';

type Homebridge = {
	hap: typeof Hap;
	registerAccessory(pluginName: string, accessoryName: string, constructor: any, configurationRequestHandler?: any): void;
};

let Service: typeof Hap.Service;
let Characteristic: typeof Hap.Characteristic;

const DEFAULT_BATTERY_LOW_LEVEL = 10;
const DEFAULT_CO_THRESHOLD = 1000;

export default function (homebridge: Homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;

	homebridge.registerAccessory(pkg.name, 'Withings Air Quality', WithingsScale);
}

class WithingsScale {
	private readonly api: WithingsApi;
	private readonly name = this.config.name;
	private readonly coThreshold = this.config.coThreshold && parseInt(this.config.coThreshold, 10) || DEFAULT_CO_THRESHOLD;

	readonly informationService = new Service.AccessoryInformation('', '');
	readonly batteryService = new Service.BatteryService('', '');
	readonly carbonDioxideService = new Service.CarbonDioxideSensor('', '');
	readonly temperatureService = new Service.TemperatureSensor('', '');

	constructor(
		private readonly log: any,
		private readonly config: Record<string, string>,
	) {
		this.api = new WithingsApi(config.email, config.password, config.mac);
		this.api.on('error', ({ message, error }) => this.log.warn(message, '/', error.message || error));

		this.init();
	}

	async init() {
		await this.api.init();

		this.batteryService.setCharacteristic(Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGEABLE);
		this.initServiceEvents(
			'battery',
			this.batteryService.getCharacteristic(Characteristic.BatteryLevel),
			() => this.api.getBatteryLevel(),
			(value) => this.setBatteryLevel(value),
		);

		this.carbonDioxideService.setCharacteristic(Characteristic.Name, 'CO² Level');
		this.initServiceEvents(
			'carbondioxide',
			this.carbonDioxideService.getCharacteristic(Characteristic.CarbonDioxideLevel),
			() => this.api.getCarbonDioxide(),
			(value) => this.setCarbonDioxideLevel(value),
		);

		this.temperatureService.setCharacteristic(Characteristic.Name, 'Temperature');
		this.initServiceEvents(
			'temperature',
			this.temperatureService.getCharacteristic(Characteristic.CurrentTemperature),
			() => this.api.getTemperature(),
			(value) => this.setTemperature(value),
		);
	}

	getServices() {
		this.informationService
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, 'Withings')
			.setCharacteristic(Characteristic.Model, 'Smart Body Analyzer')
			.setCharacteristic(Characteristic.SerialNumber, this.config.mac.replace(/(..)/g, ':$1').slice(1).toUpperCase())
			.setCharacteristic(Characteristic.FirmwareRevision, pkg.version)
		;

		return [
			this.informationService,
			this.batteryService,
			this.temperatureService,
			this.carbonDioxideService,
		];
	}

	identify(callback: () => void) {
		this.log('Identify requested!');
		callback();
	}

	private async initServiceEvents(
		type: DataType,
		characteristic: Hap.Characteristic,
		queryFn: () => number,
		updateFn: (value: number) => void,
	) {
		this.api.on(type, (value) => updateFn(value));
		characteristic.on('get' as Hap.CharacteristicEventTypes, async (cb: Hap.NodeCallback<Hap.CharacteristicValue>) => {
			const value = queryFn();
			updateFn(value);
			cb(null, value);
		});
	}

	private setBatteryLevel(value: number) {
		this.log.debug(`[Battery Level] ${value}%`);
		this.batteryService
			.setCharacteristic(Characteristic.BatteryLevel, value)
			.setCharacteristic(Characteristic.StatusLowBattery, value < DEFAULT_BATTERY_LOW_LEVEL ? 1 : 0)
		;
	}

	private setCarbonDioxideLevel(value: number) {
		this.log.debug(`[Carbon Dioxide Level] ${value}ppm`);
		this.carbonDioxideService
			.setCharacteristic(Characteristic.CarbonDioxideDetected, value >= this.coThreshold ? 1 : 0)
			.setCharacteristic(Characteristic.CarbonDioxideLevel, value)
		;
	}

	private setTemperature(value: number) {
		this.log.debug(`[Temperature] ${value}°C`);
		this.temperatureService
			.setCharacteristic(Characteristic.CurrentTemperature, value)
		;
	}
}
