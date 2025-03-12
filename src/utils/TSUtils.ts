export type ObjectKey = string | number;

export type Reducer<T, U> = (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U;

/**
 * Creates a reducer function that converts an array into a key-value map (object),
 * where keys and values are derived from a provided mapping function.
 *
 * @param fn A mapper function that takes an item and returns a [key, value] tuple.
 * @returns A reducer function to be used with Array.reduce(), building a key-value object.
 */
export function keyValue<T, U>(fn: (item: T) => [ObjectKey, U]): Reducer<T, Record<ObjectKey, U>> {
	return function(prev: Record<ObjectKey, U>, item: T) {
		const [key, value] = fn(item);

		prev[key] = value;

		return prev;
	}
}


/**
 * Inserts a value deeply into a nested object structure,
 * automatically creating intermediate objects or arrays as necessary.
 * 
 * @param value - The value to insert into the nested structure.
 * @param root - The root object to insert the value into.
 * @param keys - A list of keys specifying the path where the value should be inserted.
 * @returns The modified root object with the value inserted at the desired location.
 */
export function pushNested<T extends Object, U>(value: U, root: T, ...keys: ObjectKey[]): T {
	let base: any = root;

	for (const key of keys.slice(0, -1)) {
		base = base[key] = base[key] || {};
	}

	const lastKey = keys[keys.length -1];

	base[lastKey] = base[lastKey] || [];
	base[lastKey].push(value);

	return root;
}


/**
 * Inserts a value deeply into a nested object structure at the specified path.
 * Intermediate objects along the path are created automatically if they don't already exist.
 *
 * @param value The value to set at the nested location.
 * @param root The root object where the nested value will be set.
 * @param keys A sequence of keys representing the nested path to the value.
 * @returns The updated root object with the new nested value set.
 */
export function setNested<T, U>(value: U, root: T, ...keys: ObjectKey[]): T {
	let base: any = root;

	for (const key of keys.slice(0, -1)) {
	  base = base[key] = base[key] || {};
	}

	const lastKey = keys[keys.length -1];

	base[lastKey] = value;

	return root;
}
