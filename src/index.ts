import { Journey } from "./results/Journey";
import { loadGTFS } from "./gtfs/GTFSLoader";
import { TimetableLeg } from "./gtfs/GTFS";
import { GroupStationDepartAfterQuery } from "./query/GroupStationDepartAfterQuery";
import { GroupStationArriveByQuery } from "./query/GroupStationArriveByQuery";
import { RaptorAlgorithmFactory } from "./raptor/RaptorAlgorithmFactory";
import { JourneyFactory } from "./results/JourneyFactory";
import { Station, Ligne, Coords, FormattedJourney, TripDetail, StationDetail, StopTime } from './interfaces';
import { MultipleCriteriaDepartAfterFilter } from './results/filter/MultipleCriteriaDepartAfterFilter';
import { MultipleCriteriaArriveByFilter } from './results/filter/MultipleCriteriaArriveByFilter';
import haversine from 'haversine-distance';
import Papa from 'papaparse';
import JSZip from 'jszip';
import fs from 'fs';

export const MIN_INTERCHANGE_TIME = 3 * 60; // This is the minimal time for a corresp. (Default to 3 min)

// Emissions factors in kg CO2 per kilometer
const emissionsTram: number = 6.62;
const emissionsBus: number = 12;

// Global variables
let stations: Map<string, Station>;
let lignes: Map<string, Ligne>;
let indexedTrips: Map<string, StopTime[]>;


/**
 * Converts a given Date object to the total number of seconds since midnight.
 *
 * @param date - The Date object to be converted.
 * @returns The total number of seconds since midnight.
 */
function dateToSeconds(date: Date) {
	return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}


/**
 * Retrieves the keys of the physical stops for a given station.
 *
 * @param map - A map where the keys are station identifiers and the values are Station objects.
 * @param stationKey - The key of the station for which to retrieve the physical stop keys.
 * @returns An array of strings representing the keys of the physical stops, or undefined if the station is not found.
 */
function getPhysicalStopKeys(map: Map<string, Station>, stationKey: string): string[] | undefined {
	const station = map.get(stationKey);
	if (!station) {
		console.error(`No station found with key: ${stationKey}`);
		return undefined;
	}
	return Object.keys(station.physical_stops).map(String);
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
 * Converts an array of numbers into a `Coords` object.
 *
 * @param arr - An array of numbers where the first element is the longitude and the second element is the latitude.
 * @returns A `Coords` object with `latitude` and `longitude` properties.
 */
function toCoords(arr: number[]): Coords {
	return { latitude: arr[1], longitude: arr[0] };
}


/**
 * Finds the index of the closest point in a path to the given coordinates.
 *
 * @param coords - The coordinates to compare against the path.
 * @param path - An array of coordinates representing the path.
 * @returns The index of the closest point in the path to the given coordinates.
 */
function findClosestPointIndex(coords: Coords, path: number[][]): number {
	let closestIndex = 0;
	let minDistance = haversine(coords, toCoords(path[0]));

	for (let i = 1; i < path.length; i++) {
		const distance = haversine(coords, toCoords(path[i]));
		if (distance < minDistance) {
			minDistance = distance;
			closestIndex = i;
		}
	}

	return closestIndex;
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
function calculateEmissions(trip_details: TripDetail[], lignes: Map<string, Ligne>, stations: Map<string, Station>): number {
	let emissions = 0;

	for (const trip of trip_details) {
		const ligne = lignes.get(trip.ligne_id.toString());

		if (ligne) {
			const path = ligne.directions[trip.direction_id[0]].path;
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
 * Formats a journey into a structured format with detailed trip information.
 *
 * @param journey - The journey object containing legs of the trip.
 * @param date - The date of the journey.
 * @param stations - A map of station IDs to Station objects.
 * @param lignes - A map of line IDs to Ligne objects.
 * @param indexedTrips - A map of trip IDs to arrays of StopTime objects.
 * @returns A formatted journey object or null if no trip details are found.
 */
function formatJourney(journey: Journey, date: Date, stations: Map<string, Station>, lignes: Map<string, Ligne>, indexedTrips: Map<string, StopTime[]>): FormattedJourney | null {
	const tripDetails: TripDetail[] = [];
	for (const leg of journey.legs) {
		if ((leg as TimetableLeg).trip !== undefined) {
			const stationDetails: StationDetail[] = (leg as TimetableLeg).stopTimes.map(stopId => {
				const station = getLogicalStation(Number(stopId.stop), stations);
				return {
					logical_id: station?.key,
					physical_id: Number(stopId.stop),
					nom: station?.station.nom,
					time: stopId.departureTime,
				};
			});
			const stopTimes = indexedTrips.get((leg as TimetableLeg).trip.tripId)
			tripDetails.push({
				ligne_id: Number((leg as TimetableLeg).trip.routeId),
				direction_id: [
					Number((leg as TimetableLeg).trip.directionId),
					Number(stopTimes[stopTimes.length - 1].stop_id),
					Number((leg as TimetableLeg).trip.tripId)
				],
				stations: stationDetails
			});
		}
	}
	if (tripDetails.length === 0) {
		return null;
	}
	return {
		depart: tripDetails[0].stations[0].logical_id,
		destination: tripDetails[tripDetails.length - 1].stations[tripDetails[tripDetails.length - 1].stations.length - 1].logical_id,
		date: date.toISOString().split('T')[0],
		heure_depart: journey.departureTime,
		heure_destination: journey.arrivalTime,
		duration: journey.arrivalTime - journey.departureTime,
		emissions: calculateEmissions(tripDetails, lignes, stations),
		trip_details: tripDetails
	};

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
 * @returns An array of formatted journey objects, sorted by the number of trip details.
 */
async function searchJourneys(
		queryDepart: GroupStationDepartAfterQuery,
		queryArrive: GroupStationArriveByQuery,
		stationsDepartId: string[],
		stationsDestId: string[],
		dateTime: Date, isAller: boolean,
		stations: Map<string, Station>,
		lignes: Map<string, Ligne>,
		indexedTrips: Map<string, StopTime[]>
	) {
	const physicalStationsDepart = [];
	for (const stationDepartId of stationsDepartId)
		physicalStationsDepart.push(...getPhysicalStopKeys(stations, stationDepartId));
	const physicalStationsDest = [];
	for (const stationDestId of stationsDestId)
		physicalStationsDest.push(...getPhysicalStopKeys(stations, stationDestId));
	if (!physicalStationsDepart || !physicalStationsDest) {
		return [];
	}

	let journeys = [];
	if (isAller) {
		journeys = queryDepart.plan(physicalStationsDepart, physicalStationsDest, dateTime, dateToSeconds(dateTime));
	} else {
		journeys = queryArrive.plan(physicalStationsDepart, physicalStationsDest, dateTime, dateToSeconds(dateTime));
	}
	const formattedJourneys = journeys.map(journey => formatJourney(journey, dateTime, stations, lignes, indexedTrips)).filter(journey => journey !== null);
	formattedJourneys.sort((a, b) => a.trip_details.length - b.trip_details.length);
	return formattedJourneys;
}


/**
 * Filters out journeys that have duplicate line IDs in their trip details.
 *
 * @param {FormattedJourney[]} journeys - An array of journeys to be filtered.
 * @returns {FormattedJourney[]} - An array of journeys where each journey has unique line IDs in its trip details.
 */
function filterJourneys(journeys: FormattedJourney[]) : FormattedJourney[] {
	const filteredJourneys = [];
	for (const journey of journeys) {
		const trip = journey.trip_details;
		const tripLines = trip.map((leg: TripDetail) => leg.ligne_id);
		const uniqueLines = [...new Set(tripLines)];
		if (tripLines.length === uniqueLines.length) {
			filteredJourneys.push(journey);
		}
	}
	return filteredJourneys;
}


/**
 * Searches for itineraries based on the provided parameters.
 *
 * @param stationsDepartIds - An array of departure station IDs.
 * @param stationsDestIds - An array of destination station IDs.
 * @param dateTime - The date and time for the itinerary search.
 * @param isAller - A boolean indicating if the search is for an outbound journey.
 * @param queryDepart - The query object for departure stations.
 * @param queryArrive - The query object for arrival stations.
 * @returns A promise that resolves to an array of filtered journeys.
 */
async function searchItineraire(
	stationsDepartIds: string[],
	stationsDestIds: string[],
	dateTime: Date,
	isAller: boolean,
	queryDepart: GroupStationDepartAfterQuery,
	queryArrive: GroupStationArriveByQuery,
) {
	const journeys = await searchJourneys(queryDepart, queryArrive, stationsDepartIds, stationsDestIds, dateTime, isAller, stations, lignes, indexedTrips);
	const filteredJourneys = filterJourneys(journeys);

	console.log(filteredJourneys);
}


/**
 * Extracts stop times from a GTFS zip file and writes them to a JSON file.
 *
 * This function reads a GTFS zip file located at 'imports/gtfs.zip', extracts the 'stop_times.txt' file,
 * parses its content as CSV, and writes the parsed data to 'imports/stop_times.json' in JSON format.
 *
 * @throws {Error} If the 'stop_times.txt' file is not found in the GTFS zip file.
 *
 * @returns {Promise<void>} A promise that resolves when the extraction and writing process is complete.
 */
async function extractStopTimes() {
	const zip = new JSZip();
	const data = await fs.promises.readFile('imports/gtfs.zip');
	const extracted = await zip.loadAsync(data);

	const stopTimesFile = extracted.files['stop_times.txt'];
	if (!stopTimesFile)
		throw new Error('stop_times.txt not found in gtfs.zip');

	const stopTimesContent = await stopTimesFile.async('string');
	const stopTimes = Papa.parse(stopTimesContent, { header: true }).data;
	await fs.promises.writeFile('imports/stop_times.json', JSON.stringify(stopTimes, null, 2));
}


/**
 * Initializes and starts the Itineraire API.
 *
 * This function performs the following steps:
 * 1. Loads GTFS data from a zip file and initializes the RAPTOR algorithm.
 * 2. Configures JSON data for stations and lines.
 * 3. Extracts stop times from the GTFS zip file and sorts them by trip ID and stop sequence.
 * 4. Indexes the trips by trip ID.
 * 5. Searches for itineraries based on provided parameters.
 *
 * @async
 * @function
 * @returns {Promise<void>} A promise that resolves when the API has been started.
 */
async function startItineraireAPI() {
	// RAPTOR config
	const [trips, transfers, interchange] = await loadGTFS(fs.createReadStream("imports/gtfs.zip"));
	const raptor = RaptorAlgorithmFactory.create(trips, transfers, interchange);
	const resultsFactory = new JourneyFactory();
	const departFilter = new MultipleCriteriaDepartAfterFilter();
	const arrivalFilter = new MultipleCriteriaArriveByFilter();
	const queryDepart = new GroupStationDepartAfterQuery(raptor, resultsFactory, 1, [departFilter]);
	const queryArrive = new GroupStationArriveByQuery(raptor, resultsFactory, 1, [arrivalFilter]);

	// JSONs config
	stations = new Map<string, Station>(Object.entries(JSON.parse(await fs.readFileSync('exports/stations.json', 'utf-8'))));
	lignes = new Map<string, Ligne>(Object.entries(JSON.parse(await fs.readFileSync('exports/lignes.json', 'utf-8'))));

	// extract the txt from gtfs.zip and convert it to json
	await extractStopTimes();
	const stationsTimes: StopTime[] = JSON.parse(await fs.readFileSync('imports/stop_times.json', 'utf-8'));

	// Sort by trip_id and stop_sequence
	stationsTimes.sort((a, b) => {
		if (a.trip_id === b.trip_id) {
			return a.stop_sequence - b.stop_sequence;
		}
		return a.trip_id.localeCompare(b.trip_id);
	});

	indexedTrips = new Map<string, StopTime[]>();
	for (const stopTime of stationsTimes) {
		if (!indexedTrips.has(stopTime.trip_id)) {
			indexedTrips.set(stopTime.trip_id, []);
		}
		indexedTrips.get(stopTime.trip_id)?.push(stopTime);
	}

	// Search itineraire with your own parameters
	// Example: S5760 : Saint-Jean de Védas Centre, S5905 Saint-Jean de Védas Centre - Ortet, S5571 : Occitanie
	// Is aller : true -> Departure at date, false -> Arrival at date
	searchItineraire(["S5760", "S5905"], ["S5571"], new Date("2024-11-30T08:43:00"), true, queryDepart, queryArrive);
}

// Start the Itineraire API
startItineraireAPI();
