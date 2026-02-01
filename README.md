Cheat
---
[![CI](https://github.com/humanet-science/Cheat/actions/workflows/pytest.yml/badge.svg)](https://github.com/ThGaskin/NeuralABM/actions/workflows/pytest.yml)
[![coverage badge](https://humanet-science.github.io/Cheat/coverage-badge.svg)](https://humanet-science.github.io/Cheat/coverage-badge.svg)
[![Python 3.10](https://img.shields.io/badge/python-3.10-blue.svg)](https://www.python.org/downloads/release/python-3100/)
[![Python 3.11](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/downloads/release/python-3110/)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/release/python-3120/)
[![Python 3.14](https://img.shields.io/badge/python-3.14-blue.svg)](https://www.python.org/downloads/release/python-3140/)

Mixed Human-AI group game

## Installation
Create a virtual environment and install the required packages via 
```commandline
pip install -r requirements.txt
```
You will also need to install React and yarn:
```commandline
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
\. "$HOME/.nvm/nvm.sh"
nvm install 24
sudo apt-get install -y nodejs
npm install yarn
```
(this requires sudo privileges). Or, if you are using homebrew:
```commandline
brew install node yarn
```
Check that everything was installed:
```commandline
node -v 
npm -v
```
should print the version numbers.

Next, navigate to `Cheat/cheat_frontend` and run
```commandline
yarn install
yarn add react-scripts
npm install canvas-confetti
```

## Run
Then open two terminal windows, and run
```commandline
python -m cheat.server --port 5050
```
in one, 
and 
```commandline
cd cheat_frontend
yarn start
```
in another. The game should open automatically in a browser window.

## Adding LLMs
To play with LLMs, you must have an API key stored as an environment variable. To do this, run the following command
```console
export <NAME_OF_API_KEY>="your_api_key_here"
```
on macOS/Linux, or
```shell
setx <NAME_OF_API_KEY> "your_api_key_here"
```
on Windows. Replace `your_api_key_here` with your key, and `<NAME_OF_API_KEY>` with the following client name:

| Client        | Name of API key  |
|---------------|------------------|
| OpenAI        | OPENAI_API_KEY   |
| DeepSeek      | DEEPSEEK_API_KEY |
| Google Gemini | GEMINI_API_KEY   |

> [!WARNING]
> The API key should ideally be specific to your virtual environment. Make sure to NEVER reveal the API secret, e.g. by 
> pushing the virtual environment to a Github repo, or by publishing it online. Make sure that your virtual environment folder
> is not included in your git VCS so that it won't be accidentally pushed.

## Empirica
To install, run 
```console 
curl -fsS https://install.empirica.dev | sh
```
Then navigate to both the `cheat_empirica/server` and the `cheat_empirica/client` folders, and in each run
```console
npm install
```
Thereafter, you can start the empirica server from the `cheat_empirica` folder by running
```commandline
empirica
```