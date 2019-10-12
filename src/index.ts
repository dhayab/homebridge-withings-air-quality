import * as Hap from 'hap-nodejs';

import pkg from '../package.json';
import { WithingsApi } from './lib/api';
import { DataType } from './lib/api.types';

type AirQualityLevel = { level: number, threshold: number, label: string };
type Config = { name: string, email: string, password: string, mac: string, levels?: number[] };
type Homebridge = {
	hap: typeof Hap;
	registerAccessory(pluginName: string, accessoryName: string, constructor: any, configurationRequestHandler?: any): void;
};

let Service: typeof Hap.Service;
let Characteristic: typeof Hap.Characteristic;

const DEFAULT_BATTERY_LOW_LEVEL = 10;
const DEFAULT_AIR_QUALITY_LEVELS: AirQualityLevel[] = [
	{ level: 1, threshold: 350, label: 'Excellent' },
	{ level: 2, threshold: 1000, label: 'Good' },
	{ level: 3, threshold: 2500, label: 'Fair' },
	{ level: 4, threshold: 5000, label: 'Inferior' },
	{ level: 5, threshold: Number.MAX_SAFE_INTEGER, label: 'Poor' },
];

export default function (homebridge: Homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;

	homebridge.registerAccessory(pkg.name, 'Withings Air Quality', WithingsScale);
}

class WithingsScale {
	private readonly api: WithingsApi;
	private readonly name = this.config.name;
	private readonly levels: AirQualityLevel[];

	readonly informationService = new Service.AccessoryInformation('', '');
	readonly batteryService = new Service.BatteryService('', '');
	readonly airQualityService = new Service.AirQualitySensor('', '');
	readonly temperatureService = new Service.TemperatureSensor('', '');

	constructor(
		private readonly log: any,
		private readonly config: Config,
	) {
		this.api = new WithingsApi(config.email, config.password, config.mac);
		this.api.on('error', ({ message, error }) => this.log.warn(message, '/', error.message || error));

		if (!config.levels || config.levels.length !== DEFAULT_AIR_QUALITY_LEVELS.length - 1) {
			this.levels = DEFAULT_AIR_QUALITY_LEVELS;
		} else {
			this.levels = DEFAULT_AIR_QUALITY_LEVELS.map((level, index) => {
				return { ...level, threshold: config.levels[index] || level.threshold };
			});
		}

		this.init();
	}

	async init() {
		await this.api.init();

		this.batteryService.setCharacteristic(Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGEABLE);
		this.initServiceEvents(
			'battery',
			this.batteryService.getCharacteristic(Characteristic.BatteryLevel),
			() => this.updateBatteryLevel(),
		);

		this.airQualityService.setCharacteristic(Characteristic.Name, 'Air Quality');
		this.initServiceEvents(
			'carbondioxide',
			this.airQualityService.getCharacteristic(Characteristic.AirQuality),
			() => this.updateAirQuality(),
		);

		this.temperatureService.setCharacteristic(Characteristic.Name, 'Temperature');
		this.initServiceEvents(
			'temperature',
			this.temperatureService.getCharacteristic(Characteristic.CurrentTemperature),
			() => this.updateTemperature(),
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
			this.airQualityService,
		];
	}

	identify(callback: () => void) {
		this.log('Identify requested!');
		callback();
	}

	private async initServiceEvents(
		type: DataType,
		characteristic: Hap.Characteristic,
		updateFn: () => Hap.CharacteristicValue,
	) {
		this.api.on(type, () => updateFn());
		characteristic.on('get' as Hap.CharacteristicEventTypes, async (cb: Hap.NodeCallback<Hap.CharacteristicValue>) => {
			const value = updateFn();
			cb(null, value);
		});
	}

	private updateBatteryLevel() {
		const value = this.api.getBatteryLevel();
		this.log.debug(`[Battery Level] ${value}%`);
		this.batteryService
			.setCharacteristic(Characteristic.BatteryLevel, value)
			.setCharacteristic(Characteristic.StatusLowBattery, value < DEFAULT_BATTERY_LOW_LEVEL ? 1 : 0)
		;

		return value;
	}

	private updateAirQuality() {
		const value = this.api.getCarbonDioxide();
		const { label, level } = this.levels.find(({ threshold }) => value <= threshold);

		this.log.debug(`[Air Quality] ${label} (${value}ppm)`);
		this.airQualityService
			.setCharacteristic(Characteristic.AirQuality, level)
			.setCharacteristic(Characteristic.CarbonDioxideLevel, value)
		;

		return level;
	}

	private updateTemperature() {
		const value = this.api.getTemperature();
		this.log.debug(`[Temperature] ${value}°C`);
		this.temperatureService
			.setCharacteristic(Characteristic.CurrentTemperature, value)
		;

		return value;
	}
}
