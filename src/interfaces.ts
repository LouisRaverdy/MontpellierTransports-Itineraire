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
		[key: number]: string
	};
	path: number[][];
	stations: {
		logical_station: string;
		physical_station: number;
		is_terminus: boolean;
	}[];
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
}

export interface StopTime {
	trip_id: string;
	arrival_time: string;
	departure_time: string;
	stop_id: string;
	stop_sequence: number;
	pickup_type: string;
	drop_off_type: string;
}
