Cheat
---
Mixed Human-AI group game

## Installation
Create a virtual environment and install the required packages via 
```commandline
pip install -r requirements.txt
```
You will also need to install React and yarn via homebrew:
```commandline
brew install node yarn
```
Navigate to `Cheat/cheat_frontend` and run
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