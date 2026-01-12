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