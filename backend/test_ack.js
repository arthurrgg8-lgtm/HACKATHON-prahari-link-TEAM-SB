const { io } = require('socket.io-client');
const socket = io('http://localhost:3001', {
  auth: { token: 'prahari-operator-demo-2026' }
});

socket.on('connect', () => {
  console.log('Connected to backend');
  socket.emit('acknowledge_incident', {
    nodeID: 'VILLAGE_01',
    alert_id: 'VILLAGE_01_TEST',
    commander: 'Test Officer',
    personnel: 5,
    vehicle: 'Police Van 1'
  });
  setTimeout(() => {
    socket.disconnect();
    process.exit(0);
  }, 1000);
});
