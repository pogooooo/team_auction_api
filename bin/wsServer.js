let wss = null
const WebSocket = require('ws')

function init(server) {
    wss = new WebSocket.WebSocketServer({server})

    wss.on('connection', ws => {
        console.log('connected webSocket server')

        ws.on('message', (message) => {
            console.log(`received message : ${message}`)
        })

        ws.on('close', () => {
            console.log('webSocket server closed')
        })
    })
}

function broadcast(message) {
    if (!wss) {
        console.error('webSocket server is not initialized');
        return;
    }

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: message }));
        }
    });
}

module.exports = {
    init, broadcast
}
