export interface Station {
	nom: string;
	coords: Coords;
	physical_stops: {
		[key: number]: {
			coords: Coords;
			station_code: string;
			wheelchair_boarding: number;
			linked_lignes: number[];
		};
	};
}

export interface Ligne {
	numero: string;
	icon?: string;
	couleur: string;
	text_couleur: string;
	type: number;
	directions: {
		[key: number]: Direction;
	};
}

export interface Direction {
	noms: {
		terminus_id: number;
		nom: string;
	}[];
	paths: {
		start_id: number;
		terminus_id: number;
		coordinates: number[][];
	}[];
	stations: {
		logical_station: string;
		physical_station: number;
		is_terminus: boolean;
	}[][];
}

export interface Coords {
	latitude: number;
	longitude: number;
}

export interface TripDetail {
	ligne_id: number;
	direction_id: [number, number, number];
	stations: StationDetail[];
}

export interface StationDetail {
	logical_id: string | undefined;
	physical_id: number;
	nom: string | undefined;
	time: number;
}

export interface FormattedJourney {
	depart: string | undefined;
	destination: string | undefined;
	date: string;
	heure_depart: number;
	heure_destination: number;
	duration: number;
	emissions: number;
	trip_details: TripDetail[];
	walk_details?: WalkDetail[];
}

export enum VehicleType {
	Tram,
	Bus,
	Unknown
}

export const vehicleTypeMapping: { [key: number]: VehicleType } = {
    0: VehicleType.Tram,
    3: VehicleType.Bus,
    715: VehicleType.Bus,
};

export function getVehicleType(code: number): VehicleType {
	if (Object.prototype.hasOwnProperty.call(vehicleTypeMapping, code)) {
		return vehicleTypeMapping[code];
	}
	return VehicleType.Unknown;
}

export interface WalkDetail {
	path: [number, number][];
	start_time: number;
	end_time: number;
	distance: number;
	duration: number;
}