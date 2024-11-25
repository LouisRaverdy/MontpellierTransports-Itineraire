import { RaptorAlgorithm, StopTimes } from "../raptor/RaptorAlgorithm";
import { DayOfWeek, StopID, Time } from "../gtfs/GTFS";
import { ResultsFactory } from "../results/ResultsFactory";
import { getDateNumber } from "./DateUtil";
import { Journey } from "../results/Journey";
import { JourneyFilter } from "../results/filter/JourneyFilter";
import { keyValue } from "../ts-utils/ts_utils";
import { Arrivals, ConnectionIndex } from "../raptor/ScanResults";

/**
 * Implementation of Raptor that searches for journeys between a set of origin and destinations.
 *
 * Only returns results from a single pass of the Raptor algorithm.
 */
export class GroupStationArriveByQuery {

  constructor(
    private readonly raptor: RaptorAlgorithm,
    private readonly resultsFactory: ResultsFactory,
    private readonly maxSearchDays: number = 3,
    private readonly filters: JourneyFilter[] = []
  ) { }

  /**
   * Plan a journey between the origin and destination set of stops to arrive by the given date and time
   */
  public plan(origins: StopID[], destinations: StopID[], date: Date, time: Time): Journey[] {
    // set the arrival time for each destination
    const destinationTimes = destinations.reduce(keyValue(destination => [destination, time]), {});

    // get results for every origin and flatten into a single array
    const results = this.getJourneys(destinationTimes, origins, date);

    // apply each filter to the results
    return this.filters.reduce((rs, filter) => filter.apply(rs), results);
  }

  /**
   * Find journeys using the raptor object, if no results are found then decrement the day and keep
   * searching until results have been found or the maximum number of days has been reached
   */
  private getJourneys(destinations: StopTimes, origins: StopID[], startDate: Date): Journey[] {
    const connectionIndexes: ConnectionIndex[] = [];

    for (let i = 0; i < this.maxSearchDays; i++) {
      const date = getDateNumber(startDate);
      const dayOfWeek = startDate.getDay() as DayOfWeek;
      const [kConnections, bestArrivals] = this.raptor.scanArriveBy(destinations, date, dayOfWeek);
      const results = this.getJourneysFromConnections(kConnections, connectionIndexes, origins);

      if (results.length > 0) {
        return results;
      }

      // reset the destination arrival times, and decrement the day by one
      destinations = this.getFoundStations(kConnections, bestArrivals);
      startDate.setDate(startDate.getDate() - 1);
      connectionIndexes.push(kConnections);
    }

    return [];
  }

  /**
   * Take all the stops we've visited and set the arrival time for the previous day as the best arrival time at that
   * stop plus 1 day. This prevents invalid arrivals where the arrival time at a stop is less than 0 hours
   * e.g. arriving at 04:00 but departing at 28:30 the previous day.
   */
  private getFoundStations(kConnections: ConnectionIndex, bestArrivals: Arrivals): StopTimes {
    const allStops = Object.keys(kConnections);
    const stopsWithAnArrival = allStops.filter(d => Object.keys(kConnections[d]).length > 0);

    // create the destination arrival times by adding 1 day to the best arrival time
    return stopsWithAnArrival.reduce(keyValue(s => [s, bestArrivals[s] + 86400]), {});
  }

  /**
   * Create journeys that may span multiple days by stitching together multiple kConnection results
   * into individual journeys.
   */
  private getJourneysFromConnections(
    kConnections: ConnectionIndex,
    prevConnections: ConnectionIndex[],
    origins: StopID[]
  ): Journey[] {

    const originsWithResults = origins.filter(d => Object.keys(kConnections[d]).length > 0);
    const initialResults = originsWithResults.flatMap(d => this.resultsFactory.getReverseResults(kConnections, d));

    // reverse the previous connections and then work back through each day pre-pending journeys
    return prevConnections
      .reverse()
      .reduce((journeys, connections) => this.completeJourneys(journeys, connections), initialResults);
  }

  /**
   * Reducer that takes the current list of journeys and prepends results based on the given kConnections
   */
  private completeJourneys(results: Journey[], kConnections: ConnectionIndex): Journey[] {
    // for every results we have so far
    return results.flatMap(journeyB => {
      // find some results to the origin of that result and merge them together
      return this.resultsFactory
        .getReverseResults(kConnections, journeyB.legs[0].origin)
        .map(journeyA => this.mergeJourneys(journeyA, journeyB));
    });
  }

  /**
   * Add journey B to the end of journey A and correct the arrival / departure times
   */
  private mergeJourneys(journeyA: Journey, journeyB: Journey): Journey {
    return {
      legs: journeyA.legs.concat(journeyB.legs),
      departureTime: journeyA.departureTime,
      arrivalTime: journeyB.arrivalTime - 86400
    };
  }

}
