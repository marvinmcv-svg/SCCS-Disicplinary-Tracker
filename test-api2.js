const http = require('http');

const data = JSON.stringify({
  username: 'admin',
  password: 'admin123'
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Login response:', res.statusCode);
    const result = JSON.parse(body);
    console.log('Token received:', result.token ? 'Yes' : 'No');

    if (result.token) {
      // Now try to create an incident with more details
      const incidentData = JSON.stringify({
        date: '2026-04-19',
        time: '10:00',
        student_id: 2,
        violation_id: 22,
        location: 'Classroom',
        description: 'Test incident from API',
        witnesses: '',
        action_taken: 'Warning',
        consequence: 'Warning',
        notes: 'Test'
      });

      console.log('\nSending incident data:', incidentData);

      const incidentReq = http.request({
        hostname: 'localhost',
        port: 3001,
        path: '/api/incidents',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(incidentData),
          'Authorization': 'Bearer ' + result.token
        }
      }, (incidentRes) => {
        let incidentBody = '';
        incidentRes.on('data', (chunk) => incidentBody += chunk);
        incidentRes.on('end', () => {
          console.log('\nCreate incident response:', incidentRes.statusCode);
          console.log('Headers:', JSON.stringify(incidentRes.headers));
          console.log('Response body:', incidentBody);
        });
      });

      incidentReq.on('error', (e) => {
        console.error('Request error:', e.message);
      });

      incidentReq.write(incidentData);
      incidentReq.end();
    }
  });
});

req.on('error', (e) => {
  console.error('Login error:', e.message);
});

req.write(data);
req.end();