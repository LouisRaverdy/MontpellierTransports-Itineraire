import { StopID } from "../gtfs/GTFS";
import { StopTimes } from "./RaptorAlgorithm";
import { ScanResults } from "./ScanResults";

export class ScanResultsFactory {

  constructor(
    private readonly stops: StopID[]
  ) {}

  public create(origins: StopTimes, reverse: boolean = false): ScanResults {
    const bestArrivals = {};
    const kArrivals = [{}];
    const kConnections = {};

    for (const stop of this.stops) {
      if (reverse) {
        bestArrivals[stop] = origins[stop] || Number.MIN_SAFE_INTEGER;
        kArrivals[0][stop] = origins[stop] || Number.MIN_SAFE_INTEGER;
      } else {
        bestArrivals[stop] = origins[stop] || Number.MAX_SAFE_INTEGER;
        kArrivals[0][stop] = origins[stop] || Number.MAX_SAFE_INTEGER;
      }
      kConnections[stop] = {};
    }

    return new ScanResults(bestArrivals, kArrivals, kConnections);
  }
}
