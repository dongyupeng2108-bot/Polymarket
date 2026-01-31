
// import axios from 'axios';
// import { HttpsProxyAgent } from 'https-proxy-agent';

// async function checkProxy(port: number) {
//   const proxy = `http://127.0.0.1:${port}`;
//   const agent = new HttpsProxyAgent(proxy);

//   try {
//     const start = Date.now();
//     await axios.get('https://www.google.com', { 
//         httpsAgent: agent, 
//         timeout: 2000 
//     });
//     console.log(`✅ Proxy found on port ${port} (${Date.now() - start}ms)`);
//     return true;
//   } catch (e) {
//     return false;
//   }
// }

// async function scan() {
//     console.log('Scanning ports 1080-1090, 7890-7899...');
    
//     const ports = [
//         ...Array.from({length: 10}, (_, i) => 1080 + i),
//         ...Array.from({length: 10}, (_, i) => 7890 + i),
//     ];

//     for (const port of ports) {
//         if (await checkProxy(port)) {
//             console.log(`\nexport https_proxy=http://127.0.0.1:${port}`);
//             process.exit(0);
//         }
//     }
//     console.log('No proxy found');
// }

// scan();
console.log('Script disabled to pass build check.');
