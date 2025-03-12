/**
 * StopID e.g. NRW
 */
import { Service } from "./Service";

export type StopID = string;

/**
 * Time in seconds since midnight (note this may be greater than 24 hours).
 */
export type Time = number;

/**
 * Duration in seconds
 */
export type Duration = number;

/**
 * GTFS stop time
 */
export interface StopTime {
  stopId: StopID;
  arrivalTime: Time;
  departureTime: Time;
  tripId: TripID;
  stopSequence: number;
  pickUp: boolean;
  dropOff: boolean;
  headsign: string;
}

/**
 * Leg of a journey
 */
export interface Leg {
  origin: StopID;
  destination: StopID;
}

/**
 * Leg with a defined departure and arrival time
 */
export interface TimetableLeg extends Leg {
  stopTimes: StopTime[];
  trip: Trip;
}

/**
 * Leg with a duration instead of departure and arrival time
 */
export interface Transfer extends Leg {
  duration: Duration;
  startTime: Time;
  endTime: Time;
  transferType: string;
}

/**
 * GTFS trip_id
 */
export type TripID = string;

/**
 * GTFS service_id, used to determine the trip's calendar
 */
export type ServiceID = string;

/**
 * GTFS trip
 */
export interface Trip {
  id: TripID;
  routeId: string;
  directionId: string;
  stopTimes: StopTime[];
  serviceId: ServiceID;
  service: Service;
}

/**
 * Date stored as a number, e.g 20181225
 */
export type DateNumber = number;

/**
 * Index of dates, used to access exclude/include dates in O(1) time
 */
export type DateIndex = Record<DateNumber, boolean>;

/**
 * Sunday = 0, Monday = 1... don't blame me, blame JavaScript .getDay
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * GTFS calendar
 */
export interface Calendar {
  serviceId: ServiceID;
  startDate: DateNumber;
  endDate: DateNumber;
  days: Record<DayOfWeek, boolean>;
  exclude: DateIndex;
  include: DateIndex;
}

/**
 * Calendars indexed by service ID
 */
export type CalendarIndex = Record<ServiceID, Calendar>;

/**
 * GTFS stop
 */
export interface Stop {
  id: StopID,
  name: string,
  code: string,
  latitude: number,
  longitude: number,
  locationType: string,
  parentStation: string,
  wheelchairBoarding: string,
}

/**
 * Stops indexed by ID
 */
export type StopIndex = Record<StopID, Stop>;

/**
 * GTFS route
 */
export interface Route {
	id: string;
	shortName: string;
	longName: string;
	type: string;
	color: string;
	textColor: string;
}