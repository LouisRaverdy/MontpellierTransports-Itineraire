import { Trip, DayOfWeek, StopTime } from "../gtfs/GTFS";
import { getDateNumber } from "../query/DateUtil";
import { timeToDate } from "../utils/FormatUtils";

export interface MatchingTrip {
	tripId: number;
	terminusId: number;
	subSequence: StopTime[];
}

/**
 * Finds a matching trip based on route, direction, date, and stop sequence.
 * 
 * @param stopSequence - The ordered sequence of stop IDs for the trip.
 * @param trips - An array of available trips.
 * @param ligneId - The ID of the route (ligne).
 * @param directionId - The direction of the trip.
 * @param date - The target date for the trip.
 * @param partir - A boolean indicating whether to find the earliest (`true`) or latest (`false`) matching trip.
 * 
 * @returns A `MatchingTrip` object if a matching trip is found, otherwise `null`.
 */
export function findMatchingTrip(
	stopSequence: string[],
	trips: Trip[], 
	ligneId: number,
	directionId: number,
	date: Date,
	partir: boolean
): MatchingTrip | null {
	const matchingTrips: Map<Date, MatchingTrip> = new Map();

	for (const trip of trips) {
		if (Number(trip.routeId) !== ligneId)
			continue;
		if (Number(trip.directionId) !== directionId)
			continue;

		if (!trip.service.runsOn(getDateNumber(date), date.getDay() as DayOfWeek))
			continue;

		const tripStopSequence = trip.stopTimes.map(stop => stop.stopId);
		if (!tripStopSequence || !isSubsequence(stopSequence, tripStopSequence))
			continue;

		let tripDate = new Date(date);
		const subsequence = getSubSequence(stopSequence, trip.stopTimes);
		if (partir) {
			tripDate = timeToDate(subsequence[0].departureTime, tripDate);
			if (tripDate < date)
				continue;
		} else {
			tripDate = timeToDate(subsequence[subsequence.length - 1].departureTime, tripDate);
			if (tripDate > date)
				continue;
		}

		matchingTrips.set(tripDate, { tripId: Number(trip.id), terminusId: Number(trip.stopTimes[trip.stopTimes.length - 1].stopId), subSequence: subsequence });
	}

	const sortedTrips = new Map([...matchingTrips.entries()].sort((a, b) => a[0].getTime() - b[0].getTime()));

	if (partir)
		return sortedTrips.size > 0 ? sortedTrips.values().next().value : null;
	else
		return sortedTrips.size > 0 ?  Array.from(sortedTrips.values()).at(-1) : null;
}

/**
 * Checks whether a given subsequence appears in order within a larger sequence.
 * 
 * @param subsequence - The ordered array of stop IDs to check.
 * @param sequence - The full sequence of stop IDs.
 * 
 * @returns `true` if the subsequence appears in order within the sequence, otherwise `false`.
 */
function isSubsequence(subsequence: string[], sequence: string[]): boolean {
	if (sequence.length < subsequence.length)
		return false;

	const first = subsequence[0];
	const last = subsequence[subsequence.length - 1];

	const firstIndex = sequence.indexOf(first);
	const lastIndex = sequence.lastIndexOf(last);

	return firstIndex !== -1 && lastIndex !== -1 && firstIndex < lastIndex;
}

/**
 * Extracts a valid subsequence of stop times from a full sequence.
 * 
 * @param subsequence - The ordered array of stop IDs to extract.
 * @param sequence - The full array of `StopTime` objects.
 * 
 * @returns An array of `StopTime` objects representing the extracted subsequence.
 */
function getSubSequence(subsequence: string[], sequence: StopTime[]): StopTime[] {
	if (subsequence.length === 0) return [];

	const firstPhysicalId = subsequence[0];
	const lastPhysicalId = subsequence[subsequence.length - 1];

	const startIndex = sequence.findIndex(item => item.stopId === firstPhysicalId);
	const endIndex = sequence.findIndex(item => item.stopId === lastPhysicalId);

	if (startIndex === -1 || endIndex === -1 || startIndex > endIndex)
		throw new Error("Invalid subsequence: elements are not in order or not found in the sequence.");

	return sequence.slice(startIndex, endIndex + 1);
}