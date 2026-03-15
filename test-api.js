const http = require('http');

const testRoute = (path) => {
  return new Promise((resolve) => {
    http.get(`http://localhost:4000${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`\nRoute: ${path}`);
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${data.slice(0, 200)}...`);
        resolve();
      });
    }).on('error', (err) => {
      console.error(`Error on ${path}:`, err.message);
      resolve();
    });
  });
};

async function runTests() {
  await testRoute('/api/store/categories');
  await testRoute('/api/store/products');
  process.exit();
}

runTests();
