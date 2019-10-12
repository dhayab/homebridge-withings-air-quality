export type ApiResponse = {
	status: number,
	error?: string,
};

export type Device = {
	deviceid: number,
	devicename: string,
	deviceproperties: {
		sn: string,
		macaddress: string,
		fw: string,
		batterylvl: number,
	},
	active: number,
};

export type DeviceApiResponse = ApiResponse & {
	status: 0,
	body: {
		associations: Device[],
	},
};

export type MeasureApiResponse = ApiResponse & {
	status: 0,
	body: {
		series: ReadonlyArray<{
			type: number,
			data: ReadonlyArray<{
				date: number,
				value: number,
			}>,
		}>,
	},
};

export type DataType = 'battery' | 'carbondioxide' | 'temperature';
export type EventType = DataType | 'error';
