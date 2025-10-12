const axios = require('axios');

async function fetchLinkedInProfile(profileUrl) {
    try {
        const response = await axios.get('https://v3.scrapetable.com/linkedin/people', {
            params: {
                key: 'scr_3c32f86d4a887ed55495d66a179e',
                profileUrl
            },
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.data && response.data.person) {
            return response.data.person;
        }
        return null;
    } catch (error) {
        console.error('Error fetching LinkedIn profile:', error.message);
        return null;
    }
}

module.exports = { fetchLinkedInProfile };
