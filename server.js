require('dotenv').config();
const express = require('express');
const webPush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// VAPID keys should be generated only once and stored securely
const vapidKeys = webPush.generateVAPIDKeys();
console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);

// Store these keys in your .env file
webPush.setVapidDetails(
    'mailto:your-email@example.com', // Replace with your email
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// Store subscriptions (in a real app, use a database)
let subscriptions = [];

// Subscribe endpoint
app.post('/api/subscribe', (req, res) => {
    const subscription = req.body;
    subscriptions.push(subscription);
    res.status(201).json({});
    
    // Send a test notification
    const payload = JSON.stringify({
        title: 'Fasting Tracker',
        body: 'Successfully subscribed to notifications!'
    });
    
    webPush.sendNotification(subscription, payload)
        .catch(error => console.error(error));
});

// Endpoint to trigger notifications (for testing)
app.post('/api/notify', async (req, res) => {
    const payload = JSON.stringify({
        title: 'Fasting Update',
        body: req.body.message || 'Time to check your fast!'
    });

    const notifications = subscriptions.map(subscription => 
        webPush.sendNotification(subscription, payload)
            .catch(error => {
                console.error('Error sending notification:', error);
                // Remove invalid subscriptions
                if (error.statusCode === 410) {
                    subscriptions = subscriptions.filter(sub => sub.endpoint !== subscription.endpoint);
                }
            })
    );

    try {
        await Promise.all(notifications);
        res.json({ message: 'Notifications sent successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send notifications' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('VAPID Public Key (copy this to your script.js):', vapidKeys.publicKey);
});
