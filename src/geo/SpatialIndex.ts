import { bbox } from "@turf/turf";
import Flatbush from "flatbush";
import { FeatureCollection, LineString } from "geojson";

/**
 * Create a flatbush index for the GeoJSON LineString features.
 * 
 * @param geojson - A GeoJSON FeatureCollection containing LineString features.
 * 
 * @returns A promise that resolves when the index is built.
 */
export function buildFlatbushIndex(geojson: FeatureCollection<LineString>) {
    const index: Flatbush = new Flatbush(geojson.features.length);

    geojson.features.forEach((feature) => {
        const [minX, minY, maxX, maxY] = bbox(feature);
        index.add(minX, minY, maxX, maxY);
    });

    index.finish();
    return index;
}