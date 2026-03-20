import {EmpiricaClassic} from "@empirica/core/player/classic";
import {EmpiricaContext} from "@empirica/core/player/classic/react";
import {EmpiricaMenu, EmpiricaParticipant} from "@empirica/core/player/react";
import React from "react";
import {Game} from "./Game";
import {ExitSurvey} from "./intro-exit/ExitSurvey";
import {Introduction} from "./intro-exit/Introduction";
import { Thanks } from "./intro-exit/Thanks";
import { Consent } from "./intro-exit/Consent";
import { playerCreate } from "./intro-exit/PlayerCreate";
import LoadingWindow from "../../../cheat_frontend/src/components/GameLoading.jsx";
import {noGames} from "./intro-exit/NoGames.jsx";
import {WebSocketProvider} from "./WebSocketContext";

export default function App() {
    const urlParams = new URLSearchParams(window.location.search);
    const playerKey = urlParams.get("participantKey") || "";

    const {protocol, host} = window.location;
    const url = `${protocol}//${host}/query`;

    function introSteps({game, player}) {
        return [Introduction];
    }

    function exitSteps({game, player}) {
        return [];
    }

    return (<WebSocketProvider>
        <EmpiricaParticipant url={url} ns={playerKey} modeFunc={EmpiricaClassic}>
            <div className="h-screen relative bg-gradient-to-br from-green-900 to-blue-900">
                <EmpiricaMenu position="bottom-left"/>
                <div className="h-full overflow-auto">
                    <EmpiricaContext
                      consent={Consent}
                      playerCreate={playerCreate}
                      noGames={noGames}
                      introSteps={introSteps}
                      exitSteps={exitSteps}
                      finished={Thanks}
                      lobby={() => <LoadingWindow showCancel={false} zValue={0} />}
                    >
                        <Game/>
                    </EmpiricaContext>
                </div>
            </div>
        </EmpiricaParticipant>
    </WebSocketProvider>);
}
