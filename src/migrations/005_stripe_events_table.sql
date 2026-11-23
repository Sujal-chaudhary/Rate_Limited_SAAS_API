CREATE TABLE IF NOT EXISTS stripe_events (
    event_id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP DEFAULT NULL
);


/* NOTE:-
as Stripe generates its own unique ID like evt_1O5a7l... contains letters, numbers, and an underscore (_),
 it is a string, not a UUID therefore we used VARCHAR.
 */