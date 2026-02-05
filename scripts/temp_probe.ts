
import axios from 'axios';

const GAMMA_URL = 'https://gamma-api.polymarket.com';
const KALSHI_URL = 'https://api.elections.kalshi.com/trade-api/v2';

async function probePM() {
    console.log('--- Probing PM ---');
    try {
        // Try slug="politics"
        const url = `${GAMMA_URL}/markets?limit=1&order=volume&ascending=false&tag_slug=politics`;
        const res = await axios.get(url);
        console.log(`PM (tag_slug=politics): ${res.status} ${res.statusText}`);
        console.log(`Count: ${res.data.length}`);
        if (res.data.length > 0) {
            console.log(`Sample: ${res.data[0].question} (Vol: ${res.data[0].volume})`);
        }
    } catch (e: any) {
        console.log(`PM Error: ${e.message}`);
        if (e.response) console.log(e.response.data);
    }
}

async function probeKalshi() {
    console.log('--- Probing Kalshi ---');
    try {
        const url = `${KALSHI_URL}/series?limit=1&include_volume=true&category=POLITICS`;
        const res = await axios.get(url);
        console.log(`Kalshi (category=POLITICS): ${res.status} ${res.statusText}`);
        console.log(`Count: ${res.data.series.length}`);
        if (res.data.series.length > 0) {
            console.log(`Sample: ${res.data.series[0].title} (Vol: ${res.data.series[0].volume})`);
        }
    } catch (e: any) {
        console.log(`Kalshi Error: ${e.message}`);
        if (e.response) console.log(e.response.data);
    }
}

async function run() {
    await probePM();
    await probeKalshi();
}

run();
