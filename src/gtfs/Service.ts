import { DateIndex, DateNumber, DayOfWeek } from "./GTFS";

export class Service {

  constructor(
    private readonly startDate: DateNumber,
    private readonly endDate: DateNumber,
    private readonly days: Record<DayOfWeek, boolean>,
    private readonly dates: DateIndex,
  ) {}

  /**
   * Returns true if the service runs on the given date and day of week
   */
  public runsOn(date: number, dow: DayOfWeek): boolean {
    return this.dates[date] || (
      !this.dates.hasOwnProperty(date) &&
      this.startDate <= date &&
      this.endDate >= date &&
      this.days[dow]
    );
  }
}
