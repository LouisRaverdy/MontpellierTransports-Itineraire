export type ObjectKey = string | number;

export type Reducer<T, U> = (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U;

export function keyValue<T, U>(fn: (item: T) => [ObjectKey, U]): Reducer<T, Record<ObjectKey, U>> {
	return function(prev: Record<ObjectKey, U>, item: T) {
		const [key, value] = fn(item);

		prev[key] = value;

		return prev;
	}
}

export function pushNested<T extends Record<string, any>, U>(value: U, root: T, ...keys: ObjectKey[]): T {
	let base: unknown = root;

	for (const key of keys.slice(0, -1)) {
		base[key] = base[key] || {};
		base = base[key] = base[key] || {};
	}

	const lastKey = keys[keys.length -1];

	base[lastKey] = base[lastKey] || [];
	base[lastKey].push(value);

	return root;
}

export function setNested<T, U>(value: U, root: T, ...keys: ObjectKey[]): T {
	let base: unknown = root;

	for (const key of keys.slice(0, -1)) {
	  base = base[key] = base[key] || {};
	}

	const lastKey = keys[keys.length -1];

	base[lastKey] = value;

	return root;
}
