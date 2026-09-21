# Survivr

Top-down battle royale prototype with separate Stable and Experimental builds.

## Builds

- **Normal Build:** /stable/
- **Experimental Build:** /experimental/

## Local

```bash
npm install
npm start
```

Then open http://localhost:3000

## Hosting

Survivr is structured as a Node.js Web Service so the HTTP game files and WebSocket server can run together. Render supports Node web services and inbound WebSockets. See the deployment instructions in the project documentation.

The free Render web service is suitable for testing/hobby use, but free services can spin down after inactivity.

## Controls

- PC: WASD + mouse
- Mobile: virtual sticks + action buttons
- Experimental: adds gamepad input and basic online player presence
