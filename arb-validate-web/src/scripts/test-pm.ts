import axios from 'axios';

console.log('Proxy Env:', process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'None');

async function test() {
  const pmUrl = `https://gamma-api.polymarket.com/events?slug=which-companies-added-to-sp-500-in-q1-2026`;
  
  try {
    console.log('Fetching simple:', pmUrl);
    // Try without agent first, simple request
    const { data } = await axios.get(pmUrl, { timeout: 10000 });
    console.log('Success! Markets:', data.length);
  } catch (e: any) {
    console.error('Error:', e.message);
    if (e.code) console.error('Code:', e.code);
  }
}

test();
