import React from "react";
import CheatGame from "./CheatGame";
import {HumanetLogo} from "./utils/Logo";

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br flex flex-col from-green-900 to-blue-900">
      <div className="flex-1 overflow-auto z-10">
        <CheatGame />
      </div>
        <div className="">
            <HumanetLogo />
        </div>
    </div>
  );
}

export default App;