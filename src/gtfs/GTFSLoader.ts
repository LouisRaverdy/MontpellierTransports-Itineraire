import {Calendar, CalendarIndex, Stop, StopIndex, StopTime, Transfer, Trip} from "./GTFS";
import {Interchange, TransfersByOrigin} from "../raptor/RaptorAlgorithm";
import {pushNested, setNested } from "../utils/TSUtils";
import { readFile } from 'fs/promises';
import { TimeParser } from "./TimeParser";
import { Service } from "./Service";
import { MIN_INTERCHANGE_TIME } from "../utils/FormatUtils";

export interface GTFSPaths {
	trips: string;
	transfers: string;
	calendar: string;
	calendarDates: string;
	stops: string;
	stopTimes: string;
}

/**
 * Returns trips, transfers, interchange time and calendars from a GTFS zip.
 */
export async function loadGTFS(): Promise<GTFSData> {
	const paths: GTFSPaths = {
		trips: 'imports/GTFS/trips.json',
		stopTimes: 'imports/GTFS/stop_times.json',
		calendar: 'imports/GTFS/calendar.json',
		calendarDates: 'imports/GTFS/calendar_dates.json',
		transfers: 'exports/transfers.json',
		stops: 'imports/GTFS/stops.json'
	};

	const [tripsRaw, transfersRaw, stopsRaw, calendarsRaw, stopTimesRaw, calendarDatesRaw] = await Promise.all([
		readFile(paths.trips, "utf-8").then(JSON.parse),
		readFile(paths.transfers, "utf-8").then(JSON.parse),
		readFile(paths.stops, "utf-8").then(JSON.parse),
		readFile(paths.calendar, "utf-8").then(JSON.parse),
		readFile(paths.stopTimes, "utf-8").then(JSON.parse),
		readFile(paths.calendarDates, "utf-8").then(JSON.parse),
	]);

	const trips: Trip[] = [];
	const transfers: TransfersByOrigin = {};
	const interchange: Interchange = {};
	const calendars: CalendarIndex = {};
	const stopsIndex: StopIndex = {};
	const services: Record<string, Service> = {};

	const timeParser = new TimeParser();

	calendarsRaw.forEach((row) => {
		calendars[row.service_id] = {
			serviceId: row.service_id,
			startDate: +row.start_date,
			endDate: +row.end_date,
			days: {
				0: row.sunday === "1",
				1: row.monday === "1",
				2: row.tuesday === "1",
				3: row.wednesday === "1",
				4: row.thursday === "1",
				5: row.friday === "1",
				6: row.saturday === "1",
			},
			include: {},
			exclude: {},
		} satisfies Calendar;
	});

	calendarDatesRaw.forEach(row => {
		setNested(row.exception_type === "1", calendars[row.service_id]?.include || {}, row.date);
	});

	tripsRaw.forEach(row => {
		if (!row.trip_id || row.trip_id.trim() === "") return;
		trips.push({
			id: row.trip_id,
			serviceId: row.service_id,
			routeId: row.route_id,
			directionId: row.direction_id,
			stopTimes: [],
			service: {} as Service,
		} satisfies Trip);
	});

	const stopTimesIndex: Record<string, any[]> = {};
	stopTimesRaw.forEach(row => {
		if (!row.stop_id || row.stop_id.trim() === "") return;
		if (!row.trip_id || row.trip_id.trim() === "") return;
		if (!row.departure_time || !row.arrival_time) return;

		const departureTime = timeParser.getTime(row.departure_time);
		const arrivalTime = timeParser.getTime(row.arrival_time);
		if (isNaN(departureTime) || isNaN(arrivalTime)) return;
	
		if (!stopTimesIndex[row.trip_id]) {
			stopTimesIndex[row.trip_id] = [];
		}
		stopTimesIndex[row.trip_id].push({
			stopId: row.stop_id,
			departureTime: departureTime,
			arrivalTime: arrivalTime,
			tripId: row.trip_id,
			stopSequence: +row.stop_sequence || 0,
			pickUp: row.pickup_type === "0" || row.pickup_type === undefined || row.pickup_type === "",
			dropOff: row.drop_off_type === "0" || row.drop_off_type === undefined || row.drop_off_type === "",
			headsign: row.stop_headsign || "",
		} satisfies StopTime);
	});

	transfersRaw.forEach(row => {
		if (!row.from_stop_id || row.from_stop_id.trim() === "") return;
		if (row.from_stop_id === row.to_stop_id) {
			interchange[row.from_stop_id] = 0;
		} else {
			const transfer: Transfer = {
				origin: row.from_stop_id,
				destination: row.to_stop_id,
				duration: +row.min_transfer_time || MIN_INTERCHANGE_TIME,
				startTime: 0, // startTime & endTime are used to check when a transfer is valid (here, always)
				endTime: Number.MAX_SAFE_INTEGER,
				transferType: row.transfer_type,
			};
			pushNested(transfer, transfers, row.from_stop_id);
		}
	});

	stopsRaw.forEach(row => {
		stopsIndex[row.stop_id] = {
			id: row.stop_id,
			code: row.stop_code,
			name: row.stop_name,
			latitude: +row.stop_lat,
			longitude: +row.stop_lon,
			locationType: row.location_type,
			parentStation: row.parent_station,
			wheelchairBoarding: row.wheelchair_boarding
		} satisfies Stop;
	});

	for (const serviceId in calendars) {
		const cal = calendars[serviceId];
		services[cal.serviceId] = new Service(cal.startDate, cal.endDate, cal.days, cal.include);
	}

	for (const trip of trips) {
		trip.stopTimes = stopTimesIndex[trip.id];
		trip.service = services[trip.serviceId];
	}

	return {trips, transfers, interchange};
}

/**
 * Contents of the GTFS zip file
 */
export type GTFSData = {trips: Trip[], transfers: TransfersByOrigin, interchange: Interchange};
