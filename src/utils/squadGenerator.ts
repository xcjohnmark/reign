import { Player, Squad, getMaxPlayersPerCountry, getMaxBudget } from "./fplScoring";

/**
 * Generates a randomized but fully valid squad of 15 players adhering to:
 * - Total price <= Max Budget (based on matchday)
 * - Max players from the same country (based on matchday)
 * - 2 GKs, 5 DEFs, 5 MIDs, 3 FWDs
 * - Selects a valid starting XI (1 GK, 4 DEF, 4 MID, 2 FWD)
 * - Assigns captain and vice-captain from starters
 */
export function generateValidSquad(allPlayers: Player[], matchday: number = 1): Squad {
  const gks = allPlayers.filter(p => p.position === 'GK');
  const defs = allPlayers.filter(p => p.position === 'DEF');
  const mids = allPlayers.filter(p => p.position === 'MID');
  const fwds = allPlayers.filter(p => p.position === 'FWD');

  let attempts = 0;
  while (attempts < 1000) {
    attempts++;
    
    // 1. Select players for each position
    const selectedGks = getRandomElements(gks, 2);
    const selectedDefs = getRandomElements(defs, 5);
    const selectedMids = getRandomElements(mids, 5);
    const selectedFwds = getRandomElements(fwds, 3);

    const squadPlayers = [...selectedGks, ...selectedDefs, ...selectedMids, ...selectedFwds];

    // 2. Validate budget
    const totalPrice = squadPlayers.reduce((sum, p) => sum + p.price, 0);
    if (totalPrice > getMaxBudget(matchday)) continue;

    // 3. Validate country limit (max country limit based on matchday)
    const countryCounts: Record<string, number> = {};
    let countryValid = true;
    const maxPlayersPerCountry = getMaxPlayersPerCountry(matchday);
    for (const p of squadPlayers) {
      countryCounts[p.countryId] = (countryCounts[p.countryId] || 0) + 1;
      if (countryCounts[p.countryId] > maxPlayersPerCountry) {
        countryValid = false;
        break;
      }
    }
    if (!countryValid) continue;


    // If budget and country counts are valid, build the Squad object
    // Starters (4-4-2 formation):
    // 1 GK, 4 DEF, 4 MID, 2 FWD
    const starters = [
      selectedGks[0].id,
      selectedDefs[0].id, selectedDefs[1].id, selectedDefs[2].id, selectedDefs[3].id,
      selectedMids[0].id, selectedMids[1].id, selectedMids[2].id, selectedMids[3].id,
      selectedFwds[0].id, selectedFwds[1].id
    ];

    // Subs:
    // 1 GK sub, 1 DEF sub, 1 MID sub, 1 FWD sub
    const subs = [
      selectedGks[1].id,
      selectedDefs[4].id,
      selectedMids[4].id,
      selectedFwds[2].id
    ];

    // Select captain & vice captain from starters
    const captainId = starters[Math.floor(Math.random() * starters.length)];
    let viceCaptainId = starters[Math.floor(Math.random() * starters.length)];
    while (viceCaptainId === captainId) {
      viceCaptainId = starters[Math.floor(Math.random() * starters.length)];
    }

    return {
      starters,
      subs,
      captainId,
      viceCaptainId
    };
  }

  throw new Error("Failed to generate a valid squad after 1000 attempts");
}

function getRandomElements<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}
