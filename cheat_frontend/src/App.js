import React from "react";
import CheatGame from "./CheatGame";
import {HumanetLogo} from "./utils/Logo";

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-blue-900">
      <CheatGame />
			<HumanetLogo />
    </div>
  );
}

export default App;