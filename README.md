# Autonomous RvsB Platform (v3.0)

A production-grade, competition-compliant **Red Team vs Blue Team** cybersecurity simulation environment. This platform features trainable RL-based agents that learn from experience, governed by an LLM-based reasoning layer (`dolphin-llama3` or any locally available model).

The agents compete simultaneously in a real-time, SVG-rendered network environment. 

## 🚀 Features
* **True Concurrent Match Engine:** Red and Blue alternate turns on the same state.
* **Intelligent Agents:** Reinforcement Learning (PPO) pairs with LLM Strategy Debriefs. 
* **Model Auto-Detection:** Automatically detects your local `Ollama` instances.
* **Live Network Map:** Visualizes network nodes, patches, and active attacks in real-time.
* **Auto-generated Reports:** CVSS-style summaries post-match.

---

## 💻 Local Setup (Windows/Linux/Mac)

### 1. Prerequisites
- **Python 3.11+**
- **Node.js 18+** (for building the React UI)
- **Ollama** (optional, for LLM reasoning). Make sure to run `ollama serve` and pull a model like `dolphin-llama3`.

### 2. Installation
Clone the repository, then install Python requirements:
```bash
pip install -r requirements.txt
```
Then, install the UI dependencies:
```bash
cd ui
npm install
cd ..
```

### 3. Running Locally
Simply use the unified launch script. It will build the React UI (if you use the flag) and start the combined FastAPI OpenEnv server on port `7860`.

```bash
python start.py --build-ui
```
* **Dashboard / UI**: `http://localhost:7860/`
* **API Documentation**: `http://localhost:7860/docs`
* **OpenEnv Evaluator**: `http://localhost:7860/reset`

---

## 🌐 Hugging Face Spaces Deployment

This repository is fully configured for a "Docker" Hugging Face Space. 

### How to Deploy
1. Create a new Space on Hugging Face and select **Docker** as the SDK.
2. Push this repository's code to the Space (either via Git remote or HF UI).
3. Hugging Face will automatically use the provided `Dockerfile` to install dependencies, build the environment, and bind the unified application to port `7860`.

### Using the Space
Once the Space is running, simply navigate to your Hugging Face space URL (e.g., `https://huggingface.co/spaces/YourUser/YourSpaceName`). 
* Because we serve the React dashboard on the root `GET /` endpoint via FastAPI, simply opening the Space link will launch the professional UI directly in your browser.
* You can share this URL with anyone.
* **Note:** Hugging Face environments may not have `Ollama` installed by default. If no models are detected, the system gracefully falls back to pure Reinforcement Learning (`RL-only` mode), so matches and training will still work perfectly.

---

## 🧠 Training & Competition 

* **Training Labs:** Navigate to the Red or Blue labs via the sidebar. Select your desired model, the number of episodes, and click **Train**. The UI streams real-time metrics including Epsilon progression, exact task scores, and actual text-based **LLM Strategy Debriefs** as the agents learn.
* **MITRE ATT&CK:** Agents learn through autonomous trial and error. No datasets are required to start, however, you can bootstrap the model context using the official [MITRE ATT&CK STIX](https://github.com/mitre-attack/attack-stix-data) dataset.
