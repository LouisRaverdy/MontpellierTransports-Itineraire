// External imports
import express, { Request, Response } from 'express';
import { promises as fs } from 'fs';
import Flatbush from "flatbush";
import haversine from 'haversine-distance';
import PathFinder from "geojson-path-finder";
import { FeatureCollection, LineString } from 'geojson';

// Results
import { Journey } from "./results/Journey";
import { JourneyFactory } from "./results/JourneyFactory";
import { findMatchingTrip } from './results/DelayUtils';
import { MultipleCriteriaArriveByFilter } from './results/filter/MultipleCriteriaArriveByFilter';
import { MultipleCriteriaDepartAfterFilter } from './results/filter/MultipleCriteriaDepartAfterFilter';

// GTFS
import { loadGTFS } from "./gtfs/GTFSLoader";
import { TimeParser } from "./gtfs/TimeParser";
import { TimetableLeg, Trip } from "./gtfs/GTFS";

// Queries
import { GroupStationDepartAfterQuery } from "./query/GroupStationDepartAfterQuery";
import { GroupStationArriveByQuery } from "./query/GroupStationArriveByQuery";

// Raptor
import { RaptorAlgorithmFactory } from "./raptor/RaptorAlgorithmFactory";
import { Interchange, TransfersByOrigin } from "./raptor/RaptorAlgorithm";

// Geo
import { calcDistancePath, findClosestPointIndex, getProjectedPath } from "./geo/PathUtils";
import { buildFlatbushIndex } from "./geo/SpatialIndex";

// Interfaces
import { Station, Ligne, Coords, FormattedJourney, TripDetail, StationDetail, VehicleType, getVehicleType, WalkDetail } from './interfaces';

// Utils
import { maxDays, MIN_INTERCHANGE_TIME, timeToDate, toCoords } from './utils/FormatUtils';


// Emissions factors in kg CO2 per kilometer
const emissionsTram: number = 6.62;
const emissionsBus: number = 12;

// Datas
let stations: Map<string, Station>;
let lignes: Map<string, Ligne>;
let tripsData: Trip[] | null = null;
let transfersData: TransfersByOrigin | null = null;
let interchangeData: Interchange | null = null;

// PathFinder
let routes: FeatureCollection<LineString>;
let lineIndex: Flatbush;
let pathFinder: PathFinder<unknown, unknown>;

/**
 * Retrieves the keys of the physical stops for a given station.
 *
 * @param map - A map where the keys are station identifiers and the values are Station objects.
 * @param stationKey - The key of the station for which to retrieve the physical stop keys.
 * @param allowedVehicleTypes - An array of allowed vehicle types.
 * 
 * @returns An array of strings representing the keys of the physical stops, or undefined if the station is not found.
 */
function getPhysicalStopKeys(map: Map<string, Station>, stationKey: string, allowedVehicleTypes: VehicleType[]): string[] | undefined {
	const station = map.get(stationKey);
	if (!station) {
		console.error(`No station found with key: ${stationKey}`);
		return undefined;
	}

	let physicalStopsIds = [];
	const physicalStops = Object.entries(station.physical_stops);
	for (const [physicalId, stop] of physicalStops) {
		for (const linkedLigne of stop.linked_lignes) {
			const ligne = lignes.get(linkedLigne.toString());
			if (ligne && allowedVehicleTypes.includes(getVehicleType(ligne.type))) {
				physicalStopsIds.push(physicalId);
				break;
			}
		}
	}

	return physicalStopsIds;
}


/**
 * Retrieves the logical station corresponding to a given physical station.
 *
 * @param physicalStation - The identifier of the physical station to look for.
 * @param stations - A map of station identifiers to Station objects.
 * @returns An object containing the key and the Station object if found, otherwise undefined.
 */
function getLogicalStation(physicalStation: number, stations: Map<string, Station>): { key: string; station: Station } | undefined {
	for (const [stationId, station] of stations.entries()) {
		if (station.physical_stops.hasOwnProperty(physicalStation)) {
			return { key: stationId, station: station };
		}
	}
	return undefined;
}

/**
 * Filters a journey based on allowed vehicle types.
 * 
 * @param allowedVehicleTypes - An array of allowed vehicle types.
 * @param journey - A journey object containing trip details.
 * 
 * @returns A boolean indicating whether the journey is valid (true) or should be filtered out (false).
 */
function filterJourney(allowedVehicleTypes: VehicleType[], journey: FormattedJourney): boolean {
	for (const trip of journey.trip_details) {
		const ligne = lignes.get(trip.ligne_id.toString());
		if (!ligne) {
			console.error(`No ligne found with id: ${trip.ligne_id}`);
			return false;
		}
		if (!allowedVehicleTypes.includes(getVehicleType(ligne.type))) {
			return false;
		}
	}
	return true;
}


/**
 * Calculates the total emissions for a given set of trip details.
 *
 * @param trip_details - An array of trip details, where each trip detail contains information about the trip.
 * @param lignes - A map of line IDs to Ligne objects, representing the available lines.
 * @param stations - A map of station IDs to Station objects, representing the available stations.
 * @returns The total emissions for the given trips, rounded to two decimal places.
 *
 * The function iterates through each trip in the trip_details array and calculates the total distance traveled
 * based on the path of the line and the stations involved in the trip. It then calculates the emissions for
 * the trip based on the type of line (tram or bus) and the emission factor associated with it.
 */
function calculateEmissions(trip_details: any[], lignes: Map<string, Ligne>, stations: Map<string, Station>): number {
	let emissions = 0;

	for (const trip of trip_details) {
		const ligne = lignes.get(trip.ligne_id.toString());

		if (ligne) {
			const path = ligne.directions[trip.direction_id[0]].paths.find(path => path.terminus_id === trip.direction_id[1])?.coordinates;
			if (!path) continue;

			let totalDistance = 0;

			if (trip.stations.length > 1) {
				const firstStation = trip.stations[0];
				const lastStation = trip.stations[trip.stations.length - 1];

				const physicalStation1 = stations.get(firstStation.logical_id)?.physical_stops[firstStation.physical_id];
				const physicalStation2 = stations.get(lastStation.logical_id)?.physical_stops[lastStation.physical_id];

				if (physicalStation1 && physicalStation2) {
					const closestPointIndex1 = findClosestPointIndex(physicalStation1.coords, path);
					const closestPointIndex2 = findClosestPointIndex(physicalStation2.coords, path);

					if (closestPointIndex1 !== -1 && closestPointIndex2 !== -1) {
						if (closestPointIndex1 < closestPointIndex2) {
							for (let j = closestPointIndex1; j < closestPointIndex2; j++) {
								const coords1 = toCoords(path[j]);
								const coords2 = toCoords(path[j + 1]);
								const distance = haversine(coords1, coords2);
								totalDistance += distance;
							}
						} else {
							for (let j = closestPointIndex2; j < closestPointIndex1; j++) {
								const coords1 = toCoords(path[j]);
								const coords2 = toCoords(path[j + 1]);
								const distance = haversine(coords1, coords2);
								totalDistance += distance;
							}
						}
					} else {
						console.log("Couldn't find closest points")
						const distance = haversine(physicalStation1.coords, physicalStation2.coords);
						totalDistance += distance;
					}
				}
			}

			const emissionFactor = ligne.type === 0 ? emissionsTram : emissionsBus;
			const emissionsForTrip = (totalDistance / 1000) * emissionFactor; // Conversion des mètres en kilomètres
			emissions += emissionsForTrip;
		}
	}

	return parseFloat(emissions.toFixed(2));
}


/**
 * Filters station IDs based on allowed vehicle types.
 * 
 * @param stationIds - An array of station IDs to be filtered.
 * @param allowedVehicleTypes - An array of allowed vehicle types.
 * 
 * @returns A filtered list of station IDs that match the allowed vehicle types.
 */
function applyFilters(stationIds: string[], allowedVehicleTypes: VehicleType[]) : string[] {
	let fliteredStations: string[] = [];
	for (const stationId of stationIds) {
		const station = stations.get(stationId);
		if (!station) {
			console.error(`No station found with id: ${stationId}`);
			continue;
		}

		let stationMatchesFilter = Object.values(station.physical_stops).some(stop =>
			stop.linked_lignes.some(ligneId => allowedVehicleTypes.includes(getVehicleType(lignes.get(ligneId.toString())?.type as number)))
		);

		if (stationMatchesFilter) {
			fliteredStations.push(stationId);
		}
	}

	if (fliteredStations.length === 0) {
		fliteredStations = findClosestStations(stations.get(stationIds[0]).coords, stations, lignes, allowedVehicleTypes.map(type => [type, 2])); // assuming we take the first station
	}
	return fliteredStations;
}


/**
 * Formats a journey into a structured format with detailed trip information.
 *
 * @param journey - The journey object containing legs of the trip.
 * @param date - The date of the journey.
 * @param stations - A map of station IDs to Station objects.
 * @param lignes - A map of line IDs to Ligne objects.
 * @param startsWalk - A map of station IDs to WalkDetail objects for the start of the journey.
 * @param destsWalk - A map of station IDs to WalkDetail objects for the end of the journey.
 * 
 * @returns A formatted journey object or null if no trip details are found.
 */
function formatJourney(
	journey: Journey,
	date: Date,
	stations: Map<string, Station>,
	lignes: Map<string, Ligne>,
	startsWalk?: Map<string, WalkDetail>,
	destsWalk?: Map<string, WalkDetail>
): FormattedJourney | null {
	const tripDetails: TripDetail[] = [];
	for (const leg of journey.legs) {
		if ((leg as TimetableLeg).trip !== undefined) {
			const stationDetails: StationDetail[] = (leg as TimetableLeg).stopTimes.map(stopTime => {
				const station = getLogicalStation(Number(stopTime.stopId), stations);
				return {
					logical_id: station?.key,
					physical_id: Number(stopTime.stopId),
					nom: station?.station.nom,
					time: stopTime.departureTime,
				};
			});
			const stopTimes = tripsData.find(trip => trip.id === (leg as TimetableLeg).trip.id)?.stopTimes;
			if (!stopTimes) continue;
			
			tripDetails.push({
				ligne_id: Number((leg as TimetableLeg).trip.routeId),
				direction_id: [
					Number((leg as TimetableLeg).trip.directionId),
					Number(stopTimes[stopTimes.length - 1].stopId),
					Number((leg as TimetableLeg).trip.id)
				],
				stations: stationDetails
			});
		}
	}
	if (tripDetails.length === 0) {
		return null;
	}

	let walkDetails: WalkDetail[] = [];
	let heureDepart = journey.departureTime;
	let heureDestination = journey.arrivalTime;
	if (startsWalk) {
		const firstStation = tripDetails[0].stations[0];
		if (startsWalk.has(firstStation.logical_id)) {
			const walk = { ...startsWalk.get(firstStation.logical_id)! }
			walk.start_time = journey.departureTime - (walk.duration * 60) - MIN_INTERCHANGE_TIME;
			walk.end_time = journey.departureTime - MIN_INTERCHANGE_TIME;
			walkDetails.push(walk);

			heureDepart = walk.start_time;
		}
	}

	if (destsWalk) {
		const lastStation = tripDetails[tripDetails.length - 1].stations[tripDetails[tripDetails.length - 1].stations.length - 1];
		if (destsWalk.has(lastStation.logical_id)) {
			let walk = { ...destsWalk.get(lastStation.logical_id)! }
			walk.start_time = journey.arrivalTime + MIN_INTERCHANGE_TIME;
			walk.end_time = journey.arrivalTime + MIN_INTERCHANGE_TIME + (walk.duration * 60);
			walkDetails.push(walk);

			heureDestination = walk.end_time;
		}
	}

	const result: FormattedJourney = {
		depart: tripDetails[0].stations[0].logical_id,
		destination: tripDetails[tripDetails.length - 1].stations[tripDetails[tripDetails.length - 1].stations.length - 1].logical_id,
		date: date.toISOString().split('T')[0],
		heure_depart: heureDepart,
		heure_destination: heureDestination,
		duration: heureDestination - heureDepart,
		emissions: calculateEmissions(tripDetails, lignes, stations),
		trip_details: tripDetails
	};

	if (walkDetails.length > 0) {
		result.walk_details = walkDetails;
	}

	return result;
}

/**
 * Validates the input arguments for station IDs and a date.
 * 
 * @param stationsDepartId - Array of departure station IDs.
 * @param stationsDestId - Array of destination station IDs.
 * @param dateTime - The date and time for the journey.
 * 
 * @returns A boolean indicating whether the input is valid.
 */
function checkInputArgs(stationsDepartId: string[], stationsDestId: string[], dateTime: Date) : boolean {
	// Stations check
	if (!stationsDepartId || !stationsDestId) {
		console.error("No stations provided");
		return false;
	}

	const duplicates = stationsDepartId.filter(station => stationsDestId.includes(station));
	if (duplicates.length > 0) {
		for (const duplicate of duplicates) {
			if (stationsDepartId.length > stationsDestId.length) {
				const index = stationsDepartId.indexOf(duplicate);
				stationsDepartId.splice(index, 1);
			} else {
				const index = stationsDestId.indexOf(duplicate);
				stationsDestId.splice(index, 1);
			}
		}
	}

	if (stationsDepartId.length < 1 || stationsDestId.length < 1) {
		console.error("Not enough stations");
		return false;
	}

	if (stationsDepartId.some(station => stationsDestId.includes(station))) {
		console.error("Same station in both depart and destination");
		return false;
	}

	const validStationRegex = /^S5\d{3}$/;
	const validStationId = (id: string) => validStationRegex.test(id);
	for (const stationDepartId of stationsDepartId) {
		if (!validStationId(stationDepartId))
			return false;
	}

	for (const stationDestId of stationsDestId) {
		if (!validStationId(stationDestId))
			return false;
	}

	// Date check
	if (isNaN(dateTime.getTime())) {
		return false;
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const maxDate = new Date(today);
	maxDate.setDate(maxDate.getDate() + maxDays);

	if (dateTime < today || dateTime > maxDate) {
		console.error("Invalid date");
		return false;
	}

	return true;
}


/**
 * Searches for journeys between departure and destination stations.
 *
 * @param queryDepart - The query object used to plan the journey from the departure stations.
 * @param queryArrive - The query object used to plan the journey to the destination stations.
 * @param stationsDepartId - An array of IDs representing the departure stations.
 * @param stationsDestId - An array of IDs representing the destination stations.
 * @param dateTime - The date and time for which the journey is planned.
 * @param isAller - A boolean indicating if we need to depart or arrive at the given date and time.
 * @param stations - A map of station IDs to Station objects.
 * @param lignes - A map of line IDs to Ligne objects.
 * @param indexedTrips - A map of trip IDs to arrays of StopTime objects.
 * 
 * @returns An array of formatted journey objects, sorted by the number of trip details.
 */
async function searchJourneys(
		queryDepart: GroupStationDepartAfterQuery,
		queryArrive: GroupStationArriveByQuery,
		allowedVehicleTypes: VehicleType[],
		stationsDepartId: string[],
		stationsDestId: string[],
		dateTime: Date,
		isAller: boolean,
		stations: Map<string, Station>,
		lignes: Map<string, Ligne>,
		startsWalk?: Map<string, WalkDetail>,
		destsWalk?: Map<string, WalkDetail>
	) {
	let journeys: FormattedJourney[] = [];
	const timeParser = new TimeParser();

	for (const stationDepartId of stationsDepartId) {
		const physicalStationsDepart = getPhysicalStopKeys(stations, stationDepartId, allowedVehicleTypes);

		for (const stationDestId of stationsDestId) {
			const physicalStationsDest = getPhysicalStopKeys(stations, stationDestId, allowedVehicleTypes);

			if (!physicalStationsDepart.length || !physicalStationsDest.length) {
				continue;
			}

			if (isAller) {
				let date = new Date(dateTime);
				if (startsWalk && startsWalk.has(stationDepartId)) {
					const walk = startsWalk.get(stationDepartId)!;
					date.setSeconds(date.getSeconds() + (walk.duration * 60) + MIN_INTERCHANGE_TIME);
				}

				const plausibleJourneys = queryDepart.plan(
					physicalStationsDepart,
					physicalStationsDest,
					date,
					timeParser.getTimeFromDate(date)
				);
				for (const journey of plausibleJourneys) {
					const formattedJourney = formatJourney(journey, dateTime, stations, lignes, startsWalk, destsWalk);
					if (filterJourney(allowedVehicleTypes, formattedJourney)) {
						journeys.push(formattedJourney);
					}
				}
			}
			else {
				let date = new Date(dateTime);
				if (destsWalk && destsWalk.has(stationDestId)) {
					const walk = destsWalk.get(stationDestId)!;
					date.setSeconds(date.getSeconds() - (walk.duration * 60) - MIN_INTERCHANGE_TIME);
				}

				const plausibleJourneys = queryArrive.plan(
					physicalStationsDepart,
					physicalStationsDest,
					date,
					timeParser.getTimeFromDate(date)
				);
				for (const journey of plausibleJourneys) {
					const formattedJourney = formatJourney(journey, dateTime, stations, lignes, startsWalk, destsWalk);
					if (filterJourney(allowedVehicleTypes, formattedJourney)) {
						journeys.push(formattedJourney);
					}
				}
			}

			if (journeys.length > 5) {
				break;
			}
		}

		if (journeys.length > 10) {
			break;
		}
	}

	journeys.sort((a, b) => a.trip_details.length - b.trip_details.length);
	return journeys;
}


/**
 * Find the closest stations to the given coordinates
 * matching the specified vehicle types
 * 
 * @param coords Coordinates to search from
 * @param stations Map of stations
 * @param lignes Map of lignes
 * @param resultsByVehicule Array of [VehicleType, number] to specify how many stations to find for each vehicle type
 * 
 * @returns Array of station ids
 */
export function findClosestStations(
	coords: Coords,
	stations: Map<string, Station>,
	lignes: Map<string, Ligne>,
	resultsByVehicule: [VehicleType, number][] = [
		[VehicleType.Tram, 1],
		[VehicleType.Bus, 3]
	]
): string[] {
	const distances: { station: string; distance: number, vehicules: VehicleType[] }[] = [];

	for (const [id, station] of stations.entries()) {
		const distance = haversine(coords, station.coords);
		const vehicules = new Set<VehicleType>();

		for (const physicalStop of Object.values(station.physical_stops)) {
			for (const ligneId of physicalStop.linked_lignes) {
				const ligne = lignes.get(ligneId.toString());
				if (ligne) {
					const vehiculeType = getVehicleType(ligne.type);
					if (vehiculeType !== VehicleType.Unknown) {
						vehicules.add(vehiculeType);
					}
				}
			}
		}
		distances.push({ station: id, distance, vehicules: Array.from(vehicules) });
	}

	distances.sort((a, b) => a.distance - b.distance);

	const selectedStations: string[] = [];
	const counts = new Map<VehicleType, number>();

	for (const [vehicleType, maxCount] of resultsByVehicule) {
		counts.set(vehicleType, 0);
	}

	for (const { station, vehicules } of distances) {
		for (const [vehicleType, maxCount] of resultsByVehicule) {
			var count = counts.get(vehicleType);
			if (vehicules.includes(vehicleType) && count < maxCount) {
				selectedStations.push(station);
				counts.set(vehicleType, count + 1);
				break; // Assigne la station à un seul type et passe à la suivante
			}
		}

		// Stop si on a rempli tous les count sont au max
		const allQuotasFilled = resultsByVehicule.every(
			([vehicleType, maxCount]) => counts.get(vehicleType) >= maxCount
		);
		if (allQuotasFilled) break;
	}

	return selectedStations;
}

/**
 * Retrieves the datas required by functions
 * 
 * @returns A boolean indicating if the datas were successfully loaded
 */
async function getDatas(): Promise<boolean> {
	try {
		const [
			stationsStr,
			lignesStr,
			routesStr,
		] = await Promise.all([
			fs.readFile('exports/stations.json', 'utf-8'),
			fs.readFile('exports/lignes.json', 'utf-8'),
			fs.readFile('datas/routes.geojson', 'utf-8'),
		]);
	
		stations = new Map<string, Station>(Object.entries(JSON.parse(stationsStr)));
		lignes = new Map<string, Ligne>(Object.entries(JSON.parse(lignesStr)));
		routes = JSON.parse(routesStr);

		const { trips, transfers, interchange } = await loadGTFS();
		tripsData = trips;
		transfersData = transfers;
		interchangeData = interchange;
	
	  return true;
	} catch (error) {
		console.error("Fichiers de données non disponibles, Itinéraire down.", error);
		return false;
	}
}

/**
 * Initializes and starts the Itineraire API.
 *
 * This function performs the following steps:
 * 1. Loads GTFS data from a zip file and initializes the RAPTOR algorithm.
 * 2. Configures JSON data for stations and lines.
 * 4. Searches for itineraries based on provided parameters.
 *
 * @returns {Promise<void>} A promise that resolves when the API has been started.
 */
async function startItineraireAPI() {
	console.log("Starting Itineraire API...");
	const app = express();
	app.use(express.json());

	// Load GTFS data and initialize RAPTOR algorithm
	const isDatasLoaded = await getDatas();
	if (!isDatasLoaded) {
		console.error("Itineraire API could not be started due to missing data.");
		return;
	}
	console.log("Datas loaded.");

	// PathFinder config
	pathFinder = new PathFinder(routes, {tolerance: 0.00001});
	lineIndex = buildFlatbushIndex(routes);
	console.log("PathFinder ready.");

	// RAPTOR config
	const raptor = RaptorAlgorithmFactory.create(tripsData, transfersData, interchangeData);
	const resultsFactory = new JourneyFactory();
	const departFilter = new MultipleCriteriaDepartAfterFilter();
	const arrivalFilter = new MultipleCriteriaArriveByFilter();
	const queryDepart = new GroupStationDepartAfterQuery(raptor, resultsFactory, 1, [departFilter]);
	const queryArrive = new GroupStationArriveByQuery(raptor, resultsFactory, 1, [arrivalFilter]);
	console.log("RAPTOR ready.");

	app.post('/itineraire/trip', async (req: Request, res: Response) => {
		const { depart, destination, datetime, isAller, startLat, startLon, destLat, destLon, filters } = req.body;
		let allowedVehicleTypes: VehicleType[] = [ VehicleType.Tram, VehicleType.Bus ];

		const hasStartCoordinates = startLat !== undefined && startLon !== undefined;
		const hasEndCoordinates = destLat !== undefined && destLon !== undefined;
		const hasDepartStation = depart !== undefined;
		const hasDestinationStation = destination !== undefined;

		let stationsDepartIds: string[] = [];
		let stationsDestIds: string[] = [];

		if (!hasStartCoordinates && !hasDepartStation) {
			return res.status(400).json({ error: 'Missing required parameters.' });
		}

		if (!hasEndCoordinates && !hasDestinationStation) {
			return res.status(400).json({ error: 'Missing required parameters.' });
		}

		if (hasStartCoordinates && hasDepartStation) {
			return res.status(400).json({ error: 'Invalid parameters.' });
		}

		if (hasEndCoordinates && hasDestinationStation) {
			return res.status(400).json({ error: 'Invalid parameters.' });
		}

		if (filters && !Array.isArray(filters) && filters.length < 1) {
			return res.status(400).json({ error: 'Invalid filters.' });
		}

		if (filters) {
			allowedVehicleTypes = [];
			for (const filter of filters) {
				if (filter === 'tram') {
					allowedVehicleTypes.push(VehicleType.Tram);
				} else if (filter === 'bus') {
					allowedVehicleTypes.push(VehicleType.Bus);
				}
			}

			if (allowedVehicleTypes.length === 0) {
				return res.status(400).json({ error: 'Invalid filters.' });
			}
		}

		if (hasDepartStation) {
			let tempDepartStations: string[] = [];
			if (typeof depart === 'string') {
				tempDepartStations.push(...depart.split(','));
			} else if (Array.isArray(depart) && depart.length > 0) {
				tempDepartStations.push(...depart);
			} else {
				return res.status(400).json({ error: 'Invalid depart station.' });
			}
			stationsDepartIds = applyFilters(tempDepartStations, allowedVehicleTypes);
		}

		if (hasDestinationStation) {
			let tempDestStations: string[] = [];
			if (typeof destination === 'string') {
				tempDestStations.push(...destination.split(',')); // to remove in future versions
			} else if (Array.isArray(destination) && destination.length > 0) {
				tempDestStations.push(...destination);
			} else {
				return res.status(400).json({ error: 'Invalid destination station.' });
			}
			stationsDestIds = applyFilters(tempDestStations, allowedVehicleTypes);
		}

		const dateTime = new Date(datetime);
		if (!checkInputArgs(stationsDepartIds, stationsDestIds, dateTime) || typeof isAller !== 'boolean') {
			res.status(400).send("Invalid parameters");
			return;
		}

		let startsWalk: Map<string, WalkDetail> = new Map();
		let destsWalk: Map<string, WalkDetail> = new Map();

		if (hasStartCoordinates) {
			if (isNaN(startLat) || isNaN(startLon)) {
				return res.status(400).json({ error: 'Invalid start coordinates.' });
			}

			const startCoords = { latitude: startLat, longitude: startLon };
			if (filters) {
				stationsDepartIds.push(...findClosestStations(startCoords, stations, lignes, allowedVehicleTypes.map(type => [type, 2])));
			} else {
				stationsDepartIds.push(...findClosestStations(startCoords, stations, lignes));
			}

			for (const stationId of stationsDepartIds) {
				const station = stations.get(stationId);
				const projectedPath = getProjectedPath(startCoords, station.coords, routes, lineIndex, pathFinder);
				if (projectedPath) {
					const distance = calcDistancePath(projectedPath);
					startsWalk.set(
						stationId,
						{
							path: projectedPath,
							start_time: 0,
							end_time: 0,
							distance: distance,
							duration: Math.ceil((distance / 1.4) / 60)
						}
					);
				} else {
					stationsDepartIds = stationsDepartIds.filter(id => id !== stationId);
				}
			}
		}

		if (hasEndCoordinates) {
			if (isNaN(destLat) || isNaN(destLon)) {
				return res.status(400).json({ error: 'Invalid end coordinates.' });
			}

			const destCoords = { latitude: destLat, longitude: destLon };
			if (filters) {
				stationsDestIds.push(...findClosestStations(destCoords, stations, lignes, allowedVehicleTypes.map(type => [type, 2])));
			} else {
				stationsDestIds.push(...findClosestStations(destCoords, stations, lignes));
			}

			for (const stationId of stationsDestIds) {
				const station = stations.get(stationId);
				const projectedPath = getProjectedPath(station.coords, destCoords, routes, lineIndex, pathFinder);
				if (projectedPath) {
					const distance = calcDistancePath(projectedPath);
					destsWalk.set(
						stationId,
						{
							path: projectedPath,
							start_time: 0,
							end_time: 0,
							distance: distance,
							duration: Math.ceil((distance / 1.4) / 60)
						}
					);
				} else {
					stationsDestIds = stationsDestIds.filter(id => id !== stationId);
				}
			}
		}

		var journeys = await searchJourneys(
			queryDepart,
			queryArrive,
			allowedVehicleTypes,
			stationsDepartIds,
			stationsDestIds,
			dateTime,
			isAller,
			stations,
			lignes,
			startsWalk,
			destsWalk
		);
		res.status(200).json(journeys);
	});

	app.get('/itineraire/path', async (req: Request, res: Response) => {
		const start = req.query.startLat && req.query.startLng
			? { latitude: Number(req.query.startLat), longitude: Number(req.query.startLng) }
			: undefined;

		const finish = req.query.finishLat && req.query.finishLng
			? { latitude: Number(req.query.finishLat), longitude: Number(req.query.finishLng) }
			: undefined;

		if (!start || !finish) {
			return res.status(400).json({ error: 'Start or finish coordinates are missing' });
		}

		const projectedPath = getProjectedPath(start, finish, routes, lineIndex, pathFinder);
		if (!projectedPath) {
			return res.status(400).json({ error: 'No path found' });
		}
		const distance = calcDistancePath(projectedPath);
		res.status(200).json(
			{
				path: projectedPath,
				distance: distance,
				duration: Math.ceil((distance / 1.4) / 60)
			}
		);
	});

	app.post('/itineraire/delay', async (req: Request, res: Response) => {
		const { tripDetails, partir, newDate }: { tripDetails: TripDetail[]; partir: boolean; newDate: string } = req.body;

		const date = new Date(newDate);
		if (!tripDetails || !Array.isArray(tripDetails) || !date || isNaN(date.getTime())) {
			return res.status(400).json({ error: "Missing required parameters." });
		}

		let headTime = date;
		let newTrip: TripDetail[] = [];
		const timeParser = new TimeParser();
		if (partir) {
			for (const tripDetail of tripDetails) {
				const stopSequence = tripDetail.stations.map(station => station.physical_id.toString());

				const matchingTrip = findMatchingTrip(stopSequence, tripsData, tripDetail.ligne_id, tripDetail.direction_id[0], headTime, partir);
				if (!matchingTrip)
					return res.status(400).json({ error: "No matching trips found." });

				newTrip.push({
					ligne_id: tripDetail.ligne_id,
					direction_id: [tripDetail.direction_id[0], matchingTrip.terminusId, matchingTrip.tripId],
					stations: matchingTrip.subSequence.map(stop => {
						const station = getLogicalStation(Number(stop.stopId), stations);
						return {
							logical_id: station!.key,
							physical_id: Number(stop.stopId),
							nom: station!.station.nom,
							time: timeParser.getTimeFromDate(timeToDate(stop.departureTime, headTime))
						};
					})
				});

				headTime = timeToDate(matchingTrip.subSequence[matchingTrip.subSequence.length - 1].departureTime, headTime);
				headTime.setSeconds(headTime.getSeconds() + MIN_INTERCHANGE_TIME);
			}
		} else {
			for (let i = tripDetails.length - 1; i >= 0; i--) {
				const tripDetail = tripDetails[i];
				const stopSequence = tripDetail.stations.map(station => station.physical_id.toString());

				const matchingTrip = findMatchingTrip(stopSequence, tripsData, tripDetail.ligne_id, tripDetail.direction_id[0], headTime, partir);
				if (!matchingTrip)
					return res.status(400).json({ error: "No matching trips found." });

				newTrip.unshift({
					ligne_id: tripDetail.ligne_id,
					direction_id: [tripDetail.direction_id[0], matchingTrip.terminusId, matchingTrip.tripId],
					stations: matchingTrip.subSequence.map(stop => {
						const station = getLogicalStation(Number(stop.stopId), stations);
						return {
							logical_id: station!.key,
							physical_id: Number(stop.stopId),
							nom: station!.station.nom,
							time: timeParser.getTimeFromDate(timeToDate(stop.arrivalTime, headTime))
						};
					})
				});

				headTime = timeToDate(matchingTrip.subSequence[0].arrivalTime, headTime);
				headTime.setSeconds(headTime.getSeconds() - MIN_INTERCHANGE_TIME);
			}
		}

		return res.status(200).json(newTrip);
	});

	app.listen(3000, () => {
		console.log("Itineraire API is running on port 3000");
	});
}

// Start the Itineraire API
startItineraireAPI();

