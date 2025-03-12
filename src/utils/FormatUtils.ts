import { Coords } from "src/interfaces";

export const MIN_INTERCHANGE_TIME = 2 * 60; // This is the minimal time for a corresp. (Default to 3 min)
export const maxDays: number = 30; // Maximum number of days to search for itineraries

/**
 * Converts an array of numbers into a `Coords` object.
 *
 * @param arr - An array of numbers where the first element is the longitude and the second element is the latitude.
 * @returns A `Coords` object with `latitude` and `longitude` properties.
 */
export function toCoords(arr: number[]): Coords {
	return { latitude: arr[1], longitude: arr[0] };
}

/**
 * Converts a time value in seconds to a `Date` object.
 * The time value is treated as the number of seconds since midnight.
 * 
 * @param time - The time value in seconds.
 * @param baseDate - The base date to use for the resulting `Date` object.
 * 
 * @returns A `Date` object representing the time value.
 */
export function timeToDate(time: number, baseDate: Date): Date {
	const hours = Math.floor(time / 3600);
	const minutes = Math.floor(time / 60) % 60;
	const seconds = time % 60;
	return new Date(
		baseDate.getFullYear(),
		baseDate.getMonth(),
		baseDate.getDate(),
		hours,
		minutes,
		seconds
	);
}