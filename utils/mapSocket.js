const Alumni = require("../models/alumni-model");
const axios = require("axios");

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function initializeSocketHandlers(io) {
    io.on('connection', (socket) => {
        console.log('A user connected to the socket.');

        socket.on('getAlumniLocations', async () => {
            try {
                const alumniWithLocation = await Alumni.find({
                    location: { $ne: "", $exists: true }
                });

                const batchSize = 1;
                for (let i = 0; i < alumniWithLocation.length; i += batchSize) {
                    const batch = alumniWithLocation.slice(i, i + batchSize);

                    const locationPromises = batch.map(async (alumnus) => {
                        try {

                            const apiKey = process.env.OPENCAGE_API_KEY;
                            if (!apiKey) {
                                console.error("FATAL: OPENCAGE_API_KEY environment variable is not set.");
                                return null;
                            }
                            const mapUrl = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(alumnus.location)}&key=${apiKey}`;

                            const response = await axios.get(mapUrl, { timeout: 15000 });
                            const data = response.data;

                            if (data && data.results && data.results.length > 0) {
                                const { lat, lng } = data.results[0].geometry;
                                return {
                                    lat,
                                    lng,
                                    name: alumnus.name,
                                    title: `${alumnus.designation || 'Alumnus'} at ${alumnus.currentCompany || 'Not specified'}`
                                };
                            }
                            console.warn(`No results found for location: "${alumnus.location}"`);
                            return null;
                        } catch (err) {
                            if (axios.isAxiosError(err)) {
                                console.error(`Geocoding failed for "${alumnus.location}": Axios Error - ${err.message}`);
                                if (err.response) {
                                    console.error('Status:', err.response.status, 'Data:', err.response.data);
                                }
                            } else {
                                console.error(`Geocoding failed for "${alumnus.location}": General Error -`, err.message);
                            }
                            return null;
                        }
                    });

                    const resolvedLocations = (await Promise.all(locationPromises)).filter(Boolean);

                    if (resolvedLocations.length > 0) {
                        socket.emit('alumniLocationBatch', resolvedLocations);
                    }

                    await delay(1500);
                }
                socket.emit('locationsFinished');
            } catch (error) {
                console.error('Error fetching locations for socket:', error);
                socket.emit('locationError', { message: 'Failed to fetch locations.' });
            }
        });

        socket.on('disconnect', () => {
            console.log('User disconnected');
        });
    });
}

module.exports = initializeSocketHandlers;

