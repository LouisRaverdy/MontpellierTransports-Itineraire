import { Station } from 'src/interfaces';
import fs from 'fs/promises';

interface RawTransfer {
	from_stop_id: string;
	to_stop_id: string;
	transfer_type: string;
	min_transfer_time?: number;
}

const makeTransfersReciprocal = (transfers: RawTransfer[]): RawTransfer[] => {
	const updatedTransfers: RawTransfer[] = [...transfers];
	const seenPairs = new Set<string>();

	transfers.forEach((transfer) => {
		seenPairs.add(`${transfer.from_stop_id}-${transfer.to_stop_id}`);
	});

	transfers.forEach(transfer => {
		const reciprocalKey = `${transfer.from_stop_id}-${transfer.to_stop_id}`;
		if (!seenPairs.has(reciprocalKey)) {
			updatedTransfers.push({
				from_stop_id: transfer.from_stop_id,
				to_stop_id: transfer.to_stop_id,
				transfer_type: transfer.transfer_type,
				min_transfer_time: transfer.min_transfer_time,
			});
			seenPairs.add(reciprocalKey);
		}
	});

	return updatedTransfers;
};


/**
 * The transfers.txt is very pood, we need to fix it.
 * Here is the purpose of this function.
 * 
 * @param {Map<string, Station>} stations The stations data.
 * 
 * @returns {Promise<void>} A promise that resolves when the formatting is complete.
 */
export async function formatTransfers(stations: Map<string, Station>): Promise<void> {
	let transfersData: RawTransfer[] = JSON.parse(await fs.readFile('imports/GTFS/transfers.json', 'utf-8'));
	transfersData = makeTransfersReciprocal(transfersData);

	const transfersReplacementRaw: Record<string, RawTransfer[]> = JSON.parse(await fs.readFile('datas/transfers_replacement.json', 'utf-8'));
	for (const [fromStopId, toStops] of Object.entries(transfersReplacementRaw)) {
		transfersData = transfersData.filter(transfer => transfer.from_stop_id !== fromStopId);
		for (const transfer of toStops) {
			transfersData.push({
				from_stop_id: fromStopId,
				to_stop_id: transfer.to_stop_id,
				transfer_type: transfer.transfer_type || '2',
				min_transfer_time: transfer.min_transfer_time || 0,
			});
		}
	}

	// We add forgotten transfers by iterating over all stations and adding transfers to all physical stops
	for (const station of stations.values()) {
		const physicalStopIds = Object.keys(station.physical_stops);
		for (const physicalStationId of physicalStopIds) {
			const otherPhysicalStops = physicalStopIds.filter(neightId => neightId !== physicalStationId);
			for (const neightId of otherPhysicalStops) {
				if (!transfersData.some(transfer => transfer.from_stop_id === physicalStationId && transfer.to_stop_id === neightId)) {
					transfersData.push({
						from_stop_id: physicalStationId,
						to_stop_id: neightId,
						transfer_type: '2',
						min_transfer_time: 0,
					});
				}
			}
		}
	}

	await fs.mkdir('exports', { recursive: true });
	await fs.writeFile('exports/transfers.json', JSON.stringify(transfersData, null, 2));
}
