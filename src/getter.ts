import axios from 'axios';
import fs, { stat } from 'fs';
import JSZip from 'jszip';
import Papa from 'papaparse';
import path from 'path';
import { formatTransfers } from './transfers_replacement';
import { Station } from './interfaces';

/**
 * Parses a CSV string and writes it to a JSON file.
 * 
 * @param {string} csvData The CSV data to parse.
 * @param {string} folrderName The name of the folder to save the JSON file in.
 * @param {string} fileName The name of the CSV file.
 * 
 * @returns {Promise<void>} A promise that resolves when the parsing and writing process is complete.
 */
async function parseAndSaveCSV(csvData: string, folrderName: string, fileName: string): Promise<void> {
    return new Promise((resolve, reject) => {
        Papa.parse(csvData, {
            complete: async (results) => {
                const exportPath = path.join(__dirname, '..', 'imports', folrderName, `${fileName.split('.')[0]}.json`);

                if (!fs.existsSync(path.dirname(exportPath))) {
                    fs.mkdirSync(path.dirname(exportPath), { recursive: true });
                }

                await fs.promises.writeFile(exportPath, JSON.stringify(results.data));
                resolve();
            },
            header: true,
            error: (error) => reject(error)
        });
    });
}

/**
 * Extracts selected .txt files in the GTFS zip file, 
 * convert them to .json and writes them to a JSON file.
 *
 * @returns {Promise<void>} A promise that resolves when the process is complete.
 */
async function downloadStaticGTFS(): Promise<void> {
    try {
        const response = await axios.get("https://data.montpellier3m.fr/sites/default/files/ressources/TAM_MMM_GTFS.zip", { responseType: 'arraybuffer' });
        const dir = './imports/GTFS';

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync('imports/GTFS/gtfs.zip', response.data);
        const zip = new JSZip();
        const extracted = await zip.loadAsync(response.data);

        const filesToExtract = ["stops.txt", "trips.txt", "transfers.txt", "routes.txt", "stop_times.txt", "calendar.txt", "calendar_dates.txt"];

        for (const file of filesToExtract) {
            const csvFile = extracted.files[file];
            if (!csvFile) {
                throw new Error(`Fichier ${file} non trouvé dans le ZIP`);
            }

            const csvData = await csvFile.async('string');
            await parseAndSaveCSV(csvData, 'GTFS', file);
        }
    } catch (error) {
        return console.error("Error downloading GTFS data :", error);
    }
}

async function getAPIData(page: string): Promise<void> {
    try {
        const response = await axios.get(`https://api.montpellier-transports.fr/datas/${page}`);
        const exportPath = path.join(__dirname, '..', 'exports', `${page}.json`);
        await fs.promises.writeFile(exportPath, JSON.stringify(response.data));
    } catch (error) {
        console.error("Error downloading API data :", error);
    }
}

async function startGetter(): Promise<void> {
    await Promise.all([
        downloadStaticGTFS(),
        getAPIData('stations'),
        getAPIData('lignes')
    ]);

    const stationsData = await fs.promises.readFile('exports/stations.json', 'utf-8');
    const stations = new Map<string, Station>(Object.entries(JSON.parse(stationsData)));
    formatTransfers(stations);

    console.log("Data downloaded successfully.");
}

startGetter();