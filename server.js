const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory Database for Deliveries
let deliveries = [
    { id: 1, retailer: "ElectroShop Nairobi", customer: "John Doe", phone: "+254712345678", address: "Westlands, Nairobi", item: "Wireless Router", status: "Pending", rider: "Unassigned" },
    { id: 2, retailer: "MedPlus Pharmacy", customer: "Jane Smith", phone: "+254798765432", address: "Kilimani, Nairobi", item: "Prescription Refill", status: "Assigned", rider: "Rider Alex" }
];

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Send current state to newly connected client
    socket.emit('init_data', deliveries);

    // Handle new delivery request from Retailer
    socket.on('create_delivery', (data) => {
        const newDelivery = {
            id: Date.now(),
            retailer: data.retailer,
            customer: data.customer,
            phone: data.phone,
            address: data.address,
            item: data.item,
            status: "Pending",
            rider: "Unassigned"
        };
        deliveries.push(newDelivery);
        io.emit('update_deliveries', deliveries); // Broadcast to everyone
    });

    // Handle rider assignment from Dispatcher
    socket.on('assign_rider', (data) => {
        const delivery = deliveries.find(d => d.id === data.id);
        if (delivery) {
            delivery.rider = data.rider;
            delivery.status = "Assigned";
            io.emit('update_deliveries', deliveries);
        }
    });

    // Handle status update from Rider
    socket.on('update_status', (data) => {
        const delivery = deliveries.find(d => d.id === data.id);
        if (delivery) {
            delivery.status = data.status;
            io.emit('update_deliveries', deliveries);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Reflex server running on http://localhost:${PORT}`);
});