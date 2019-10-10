import * as Hap from 'hap-nodejs';

import { Measure, WithingsApi } from './lib/api';

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

	homebridge.registerAccessory(process.env.npm_package_name, 'Withings Air Quality', WithingsScale);
}

class WithingsScale {
	private readonly api: WithingsApi;
	private readonly log: any;
	private readonly name: string;
	private readonly coThreshold: number;

	readonly informationService = new Service.AccessoryInformation('', '');
	readonly batteryService = new Service.BatteryService('', '');
	readonly carbonDioxideService = new Service.CarbonDioxideSensor('', '');
	readonly temperatureService = new Service.TemperatureSensor('', '');

	constructor(log: any, config: Record<string, string>) {
		this.log = log;
		this.name = 'Air Quality';
		this.coThreshold = parseInt(config.coThreshold, 10) || DEFAULT_CO_THRESHOLD;

		this.api = new WithingsApi(config.email, config.password, config.mac);

		this.informationService
			.setCharacteristic(Characteristic.Manufacturer, 'Withings')
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Model, process.env.npm_package_name)
			.setCharacteristic(Characteristic.SerialNumber, config.mac.replace(/(..)/g, ':$1').slice(1).toUpperCase())
			.setCharacteristic(Characteristic.FirmwareRevision, process.env.npm_package_version)
		;

		this.api.connect()
			.then(() => this.initServices())
			.catch((error: Error) => this.log.error(error.message))
		;
	}

	async initServices() {
		const device = await this.api.getDeviceInfo();

		this.setBatteryLevel(device.deviceproperties.batterylvl);
		this.api.on('device', (device) => this.setBatteryLevel(device.deviceproperties.batterylvl));
		this.batteryService
			.getCharacteristic(Characteristic.BatteryLevel)!
			.on('get' as Hap.CharacteristicEventTypes, async (callback: Hap.NodeCallback<Hap.CharacteristicValue>) => {
				const device = await this.api.getDeviceInfo();
				this.setBatteryLevel(device.deviceproperties.batterylvl);
				callback(null, device.deviceproperties.batterylvl);
			})
		;

		this.carbonDioxideService.setCharacteristic(Characteristic.Name, 'CO² Level');
		this.api.on('carbondioxide', (value) => this.setCarbonDioxideLevel(value));
		this.carbonDioxideService
			.getCharacteristic(Characteristic.CarbonDioxideLevel)!
			.on('get' as Hap.CharacteristicEventTypes, async (callback: Hap.NodeCallback<Hap.CharacteristicValue>) => {
				const value = await this.api.getMeasure(Measure.CarbonDioxide);
				this.setCarbonDioxideLevel(value);
				callback(null, value);
			})
		;

		this.temperatureService.setCharacteristic(Characteristic.Name, 'Temperature');
		this.api.on('temperature', (value) => this.setTemperature(value));
		this.temperatureService
			.getCharacteristic(Characteristic.CurrentTemperature)!
			.on('get' as Hap.CharacteristicEventTypes, async (callback: Hap.NodeCallback<Hap.CharacteristicValue>) => {
				const value = await this.api.getMeasure(Measure.Temperature);
				this.setTemperature(value);
				callback(null, value);
			})
		;
	}

	getServices() {
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

	setBatteryLevel(value: number) {
		this.log(`Battery level: ${value}%`);
		this.batteryService
			.setCharacteristic(Characteristic.BatteryLevel, value)
			.setCharacteristic(Characteristic.StatusLowBattery, value < DEFAULT_BATTERY_LOW_LEVEL ? 1 : 0)
		;
	}

	setCarbonDioxideLevel(value: number) {
		this.log(`Carbon dioxide level: ${value}ppm`);
		this.carbonDioxideService
			.setCharacteristic(Characteristic.CarbonDioxideDetected, value >= this.coThreshold ? 1 : 0)
			.setCharacteristic(Characteristic.CarbonDioxideLevel, value)
		;
	}

	setTemperature(value: number) {
		this.log(`Temperature: ${value}°`);
		this.temperatureService
			.setCharacteristic(Characteristic.CurrentTemperature, value)
		;
	}
}
