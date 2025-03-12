import Flatbush from 'flatbush';
import { FeatureCollection, LineString, Position } from 'geojson';
import PathFinder from 'geojson-path-finder';
import haversine from 'haversine-distance';
import { Coords } from 'src/interfaces';
import { toCoords } from '../utils/FormatUtils';

/**
 * Finds the index of the closest point in a path to the given coordinates.
 *
 * @param coords - The coordinates to compare against the path.
 * @param path - An array of coordinates representing the path.
 * @returns The index of the closest point in the path to the given coordinates.
 */
export function findClosestPointIndex(coords: Coords, path: number[][]): number {
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
 * Finds the nearest point and segment on a GeoJSON LineString network to a given coordinate.
 * 
 * @param geojson - A GeoJSON FeatureCollection containing LineString features.
 * @param index - A Flatbush spatial index for efficient spatial searches.
 * @param coords - The target coordinates (latitude and longitude).
 * 
 * @returns An object containing:
 *   - `closestPoint`: The closest point on a segment from the LineString.
 *   - `closestSegment`: The segment (two points) that contains the closest point.
 */
function nearestSubpointInGeoJSON(
    geojson: FeatureCollection<LineString>,
    index: Flatbush,
    coords: { latitude: number; longitude: number },
): { closestPoint: [number, number]; closestSegment: [number, number][] } {
    let closestPoint: [number, number] = [coords.longitude, coords.latitude];
    let closestSegment: [number, number][] = [[0, 0], [0, 0]];
    let minimalDistance = Infinity;
    let radius = 0.01; // Define search radius around the point

    // Find nearby LineStrings using the spatial index within the given radius
    const nearbyLines = index.search(
        coords.longitude - radius, // minX
        coords.latitude - radius,  // minY
        coords.longitude + radius, // maxX
        coords.latitude + radius   // maxY
    ).map((i) => geojson.features[i]);

    // Iterate over each LineString to find the closest point and segment
    for (const feature of nearbyLines) {
        const coordinates = feature.geometry.coordinates as [number, number][];

        for (let i = 0; i < coordinates.length - 1; i++) {
            const segment = [coordinates[i], coordinates[i + 1]];

            // Project the coordinate onto the current segment to find the nearest subpoint
            const projectedPoint = nearestSubpointOnSegment(segment, [coords.longitude, coords.latitude]);

            // Calculate the Haversine distance between the input coordinate and the projected point
            const distance = haversine(
                { latitude: coords.latitude, longitude: coords.longitude },
                { latitude: projectedPoint[1], longitude: projectedPoint[0] }
            );

            // Update the closest point and segment if a new minimal distance is found
            if (distance < minimalDistance) {
                minimalDistance = distance;
                closestPoint = projectedPoint;
                closestSegment = segment;
            }
        }
    }

    return { closestPoint, closestSegment };
}


/**
 * Finds the nearest subpoint on a given segment to a target point.
 * 
 * @param segment - A line segment represented as an array of two coordinate pairs [longitude, latitude].
 * @param target - The target point [longitude, latitude] to project onto the segment.
 * 
 * @returns The closest point on the segment to the target.
 */
function nearestSubpointOnSegment(
    segment: [number, number][],
    target: [number, number]
): [number, number] {
    const [A, B] = segment;
    const t = Math.max(
        0,
        Math.min(
            1,
            ((target[0] - A[0]) * (B[0] - A[0]) + (target[1] - A[1]) * (B[1] - A[1])) /
                (Math.pow(B[0] - A[0], 2) + Math.pow(B[1] - A[1], 2))
        )
    );

    const projectedPoint: [number, number] = [
        A[0] + t * (B[0] - A[0]),
        A[1] + t * (B[1] - A[1])
    ];

    return projectedPoint;
}


/**
 * Finds the nearest endpoint of a given segment to a target point.
 * 
 * @param segment - A line segment represented as an array of two coordinate pairs [longitude, latitude].
 * @param target - The target point [longitude, latitude].
 * 
 * @returns The closest endpoint of the segment to the target.
 */
function nearestPointOnSegment(
    segment: [number, number][],
    target: [number, number]
): [number, number] {
    if (haversine(segment[0], target) < haversine(segment[1], target)) {
        return segment[0];
    } else {
        return segment[1];
    }
}


/**
 * Checks if a given point lies on a specified line segment.
 * 
 * @param segment - A line segment represented as an array of two coordinate pairs [longitude, latitude].
 * @param point - The point [longitude, latitude] to check.
 * 
 * @returns A boolean indicating whether the point lies on the segment.
 */
function isPointInSegment(segment: [number, number][], point: [number, number]): boolean {
    const [A, B] = segment;

    if (A === undefined || B === undefined) {
        return false;
    }

    // Vérifier si le point est sur la ligne entre A et B
    const crossProduct = (point[1] - A[1]) * (B[0] - A[0]) - (point[0] - A[0]) * (B[1] - A[1]);

    // Si le produit vectoriel est différent de 0, le point n'est pas sur la ligne
    if (Math.abs(crossProduct) > Number.EPSILON) {
        return false;
    }

    // Vérifier si le point est dans les limites du segment
    const dotProduct = (point[0] - A[0]) * (B[0] - A[0]) + (point[1] - A[1]) * (B[1] - A[1]);
    if (dotProduct < 0) {
        return false;
    }

    const squaredLength = (B[0] - A[0]) ** 2 + (B[1] - A[1]) ** 2;
    if (dotProduct > squaredLength) {
        return false;
    }

    return true;
}


/**
 * Adjusts a path by ensuring the start and finish coordinates are correctly placed.
 * 
 * @param rawPath - The original path as an array of coordinate pairs [longitude, latitude].
 * @param startCoords - The exact starting coordinates to be included in the path.
 * @param finishCoords - The exact finishing coordinates to be included in the path.
 * 
 * @returns A modified path array with adjusted start and finish coordinates.
 */
function adjustPathToSubpoints(
    rawPath: Position[],
    startCoords: [number, number],
    finishCoords: [number, number]
): [number, number][] {
    const adjustedPath: [number, number][] = [...rawPath] as [number, number][];

    if (isPointInSegment([rawPath[0] as [number, number], rawPath[1] as [number, number]], startCoords)) {
        adjustedPath[0] = startCoords;
    } else {
        adjustedPath.unshift(startCoords);
    }

    if (isPointInSegment([rawPath[rawPath.length - 2] as [number, number], rawPath[rawPath.length - 1] as [number, number]], finishCoords)) {
        adjustedPath[adjustedPath.length - 1] = finishCoords;
    } else {
        adjustedPath.push(finishCoords);
    }

    return adjustedPath;
}


/**
 * Project start and finish coordinates onto the nearest subpoints of the path.
 * 
 * @param start - The starting coordinates [latitude, longitude].
 * @param finish - The finishing coordinates [latitude, longitude].
 * @param routes - A GeoJSON FeatureCollection containing LineString features.
 * @param lineIndex - A Flatbush spatial index for efficient spatial searches.
 * 
 * @returns The total distance in kilometers, rounded up to the nearest whole number.
 */
export function getProjectedPath(
    start: { latitude: number; longitude: number },
    finish: { latitude: number; longitude: number },
    routes: FeatureCollection<LineString>,
    lineIndex: Flatbush,
    pathFinder: PathFinder<unknown, unknown>
): [number, number][] | null {
    const projectedStart = nearestSubpointInGeoJSON(routes, lineIndex, start);
    const projectedFinish = nearestSubpointInGeoJSON(routes, lineIndex, finish);

    const pointStart = nearestPointOnSegment(projectedStart.closestSegment, [start.longitude, start.latitude]);
    const pointFinish = nearestPointOnSegment(projectedFinish.closestSegment, [finish.longitude, finish.latitude]);

    let rawPath;
    try {
        rawPath = pathFinder.findPath(
            { type: 'Feature', geometry: { type: 'Point', coordinates: pointStart }, properties: {} },
            { type: 'Feature', geometry: { type: 'Point', coordinates: pointFinish }, properties: {} }
        );
    } catch (error) {
        return null;
    }

    if (!rawPath)
        return null;
    return adjustPathToSubpoints(rawPath.path, projectedStart.closestPoint, projectedFinish.closestPoint);
}


/**
 * Calculates the total distance of a given path using the Haversine formula.
 * 
 * @param path - An array of coordinate pairs [longitude, latitude] representing the path.
 * 
 * @returns The total distance in kilometers, rounded up to the nearest whole number.
 */
export function calcDistancePath(path: [number, number][]): number {
    let distance = 0;
    if (path.length < 2) return distance;
    for (let i = 0; i < path.length - 1; i++) {
        distance += haversine({ latitude: path[i][1], longitude: path[i][0] }, { latitude: path[i + 1][1], longitude: path[i + 1][0] });
    }
    return Math.ceil(distance);
}