# HemoScope

Spaceflight-aware health monitoring for astronauts on long missions. HemoScope compares each astronaut with their own preflight normal, adjusts for the phase of the mission, and turns daily vitals and blood counts into one clear status.

**Live app:** [hemoscope-app.vercel.app](https://hemoscope-app.vercel.app) · Built for the NASA Space Apps Challenge 2026: *Create Health Monitoring Software for Astronauts on Space Missions*

## What it does
- **Daily Check:** vital signs, sleep, mood and symptoms, scored with NEWS2 adjusted for spaceflight.
- **Blood Check:** white cell counts compared with the astronaut's own baseline, with the Immune Deviation Score and hard safety limits.
- **Two machine learning models:** a Next Blood Check Forecast and an Immune State Map.
- **Learn and Ask HemoScope:** plain-language lessons and an offline search of HemoScope's own content.
- **Emergency Mode:** step-by-step guides written for microgravity, with a CPR compression pacer.
- **Two views:** astronaut and flight surgeon. Everything runs in the browser with no internet connection.

## Machine learning
Trained on 1,286 blood counts from 120 healthy adults (ImmPort) and tested on people the models never saw.

- **Next Blood Check Forecast** (Kalman filter): the 95% range held the real next value 96.1% of the time.
- **Immune State Map** (PCA and a Gaussian mixture model): the 50%, 90% and 99% zones held 51.2%, 92.0% and 99.7% of checks.

Training runs on **Microsoft Azure Machine Learning** ([`azure/`](azure/README.md)). The app reads the finished models from `lib/models/`. Full write-up: [`docs/MACHINE_LEARNING.md`](docs/MACHINE_LEARNING.md).

## Data
NASA Open Science Data Repository OSD-569 (Inspiration4 blood counts) and ImmPort studies SDY180, SDY296, SDY301 and SDY1252. Sources, credit and terms: [`data/README.md`](data/README.md).

## Run it
```
npm install
npm run dev     # http://localhost:3000
npm test
```

HemoScope is a hackathon prototype for demonstration, not a medical device.
