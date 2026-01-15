import { ClassicListenersCollector } from "@empirica/core/admin/classic";
export const Empirica = new ClassicListenersCollector();

Empirica.onGameStart(async ({ game }) => {

  // Start up function once the initial introduction steps have been completed. The treatment file is sent as a
  // game configuration to the backend, which creates a placeholder game and adds the survey participants
  // Create a game in the backend using the configuration
  const playerIds = game.players.map(p => p.id);

  // Get the treatment
  const treatment = game.get("treatment");

  console.log('here', game.get("treatment"), game.players, playerIds)

  // Send the backend a signal to initialise a game with the players
  try {
    const response = await fetch('http://localhost:5050/api/games/from_config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cfg: {
          cfg_key: treatment.gameConfiguration,
          game_id: game.scope.id,
          players: playerIds
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }

    console.log("Backend game created successfully");
    game.set("backendGameId", game.scope.id);

  } catch (error) {
    console.error("Failed to create backend game:", error);
  }

  // Add a single round with one stage for the Cheat game
  const round = game.addRound({ name: "Cheat Game" });
  round.addStage({
    name: "Play",
    duration: 3600  // 60 minutes - adjust as needed
  });

});

Empirica.onRoundStart(({ round }) => {});

Empirica.onStageStart(({ stage }) => {});

Empirica.onStageEnded(({ stage }) => {});

Empirica.onRoundEnded(({ round }) => {});

Empirica.onGameEnded(({ game }) => {});