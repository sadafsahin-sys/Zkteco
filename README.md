# ZKTeco Biometric Device Integration Engine

A high-performance Node.js backend infrastructure engineered to interface with ZKTeco biometric attendance and access control hardware. This microservice establishes raw network socket configurations, handles enterprise database pooling, and mitigates device synchronization latencies.

## ⚡ Technical Architecture
* **Connection Pooling:** Built with optimized database connection pooling to handle concurrent transaction write-backs from devices seamlessly.
* **Network Stability:** Engineered with auto-reconnection logic and request timeouts to survive volatile local hardware network drops.
* **REST Interface:** Exposes clean backend utilities to stream biometric payloads straight to enterprise database configurations.

## 📂 Project Setup
1. **Install Dependencies:**
   ```bash
   npm install
