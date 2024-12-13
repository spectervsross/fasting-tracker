require('dotenv').config();
const express = require('express');
const webPush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

app.use(session({
    secret: 'fasting_tracker_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const vapidKeys = {
    publicKey: "BPjW4qHztYuQcWyBVpk8MgGzktBOIN_IY4cPFlUFMDWuJgiQdABEeACfv2qNJ0ofWFjlqHCJWEDNb8ICKCMwC1o",
    privateKey: "t6zoE-AR9FvkIR3rmfVQC9JLwC6DpZDeujDz14awVoA"
};

webPush.setVapidDetails(
    'mailto:young.kkim2@gmail.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

let subscriptions = [];

// Subscribe Endpoint
app.post('/api/subscribe', (req, res) => {
    const subscription = req.body;
    subscriptions.push(subscription);
    res.status(201).json({});

    const payload = JSON.stringify({
        title: 'Fasting Tracker',
        body: 'Subscribed successfully!'
    });

    webPush.sendNotification(subscription, payload).catch(error => console.error(error));
});

// Trigger Notification Endpoint
app.post('/api/notify', (req, res) => {
    const payload = JSON.stringify({
        title: 'Fasting Update',
        body: req.body.message || 'Time to check your fast!'
    });

    const notifications = subscriptions.map(subscription =>
        webPush.sendNotification(subscription, payload).catch(error => {
            console.error('Failed to send notification:', error);
            if (error.statusCode === 410) {
                subscriptions = subscriptions.filter(sub => sub.endpoint !== subscription.endpoint);
            }
        })
    );

    Promise.all(notifications)
        .then(() => res.json({ message: 'Notifications sent successfully' }))
        .catch(error => res.status(500).json({ error: 'Failed to send notifications' }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
