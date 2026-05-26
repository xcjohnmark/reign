import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DATA_PATH = path.join(__dirname, '../src/data/seedData.json');

// Regional Name Pools for realistic name generation
const namePools = {
  latin: {
    firsts: ["Juan", "Jose", "Carlos", "Luis", "Diego", "Gabriel", "Lucas", "Thiago", "Mateo", "Bruno", "Felipe", "Enzo", "Lautaro", "Rodrigo", "Miguel"],
    lasts: ["Rodriguez", "Gomez", "Fernandez", "Lopez", "Silva", "Santos", "Costa", "Martin", "Diaz", "Gimenez", "Almeida", "Pereira", "Torres", "Ramirez"]
  },
  english: {
    firsts: ["James", "John", "Robert", "Michael", "William", "David", "Richard", "Thomas", "Charles", "Christopher", "Daniel", "Matthew", "Tyler", "Ethan"],
    lasts: ["Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Anderson", "Taylor", "Thomas", "Moore", "Martin", "Jackson"]
  },
  euro: {
    firsts: ["Hans", "Thomas", "Jan", "Petr", "Andreas", "Karl", "Luka", "Ivan", "Sven", "Johan", "Lars", "Nils", "Marc", "Luc", "Stefan", "Milan", "Jonas"],
    lasts: ["Müller", "Schmidt", "Fischer", "Novak", "Svoboda", "Gruber", "Wagner", "Horvat", "Kovac", "Andersson", "Eriksson", "de Jong", "van Dijk", "Weber"]
  },
  africa: {
    firsts: ["Sipho", "Thabo", "Mohamed", "Ahmed", "Youssef", "Sadio", "Cheikh", "Didier", "Kojo", "Kwame", "Moussa", "Amadi", "Babajide", "Lamine"],
    lasts: ["Dube", "Ndlovu", "Haddad", "Mansour", "Diallo", "N'Diaye", "Kouadio", "Kone", "Mensah", "Gyan", "Sow", "Diop", "Toure", "Traore"]
  },
  asia: {
    firsts: ["Min-jun", "Seo-jun", "Haruto", "Yuto", "Ali", "Reza", "Sardor", "Jasur", "Abdullah", "Fahad", "Hiroto", "Sota", "Koki", "Ye-jun"],
    lasts: ["Kim", "Lee", "Sato", "Tanaka", "Rezaei", "Al-Harbi", "Al-Shorafi", "Karimov", "Watanabe", "Ito", "Park", "Choi", "Takahashi"]
  }
};

// Map countries to their regional name pools
const countryRegions = {
  // Latin
  MEX: 'latin', ARG: 'latin', BRA: 'latin', COL: 'latin', ECU: 'latin', ESP: 'latin', URU: 'latin', CPV: 'latin', PAR: 'latin', PAN: 'latin',
  // English
  USA: 'english', CAN: 'english', ENG: 'english', SCO: 'english', AUS: 'english', NZL: 'english', GHA: 'english',
  // Euro
  CZE: 'euro', GER: 'euro', AUT: 'euro', CRO: 'euro', BEL: 'euro', NED: 'euro', SWE: 'euro', NOR: 'euro', SUI: 'euro', SCO: 'euro',
  // Africa / Arab
  RSA: 'africa', MAR: 'africa', TUN: 'africa', EGY: 'africa', SEN: 'africa', CIV: 'africa', ALG: 'africa', COD: 'africa', QAT: 'africa', JOR: 'africa', IRQ: 'africa',
  // Asia
  KOR: 'asia', JPN: 'asia', IRN: 'asia', KSA: 'asia', UZB: 'asia'
};

function getRandomName(countryId) {
  const region = countryRegions[countryId] || 'english';
  const pool = namePools[region];
  const first = pool.firsts[Math.floor(Math.random() * pool.firsts.length)];
  const last = pool.lasts[Math.floor(Math.random() * pool.lasts.length)];
  return `${first} ${last}`;
}

function run() {
  console.log("Loading seedData.json...");
  const rawData = fs.readFileSync(SEED_DATA_PATH, 'utf8');
  const data = JSON.parse(rawData);

  const countries = data.countries;
  const players = data.players;

  console.log(`Current players count: ${players.length}`);

  let nextId = Math.max(...players.map(p => p.id)) + 1;
  const playersByCountry = {};
  for (const p of players) {
    if (!playersByCountry[p.countryId]) {
      playersByCountry[p.countryId] = [];
    }
    playersByCountry[p.countryId].push(p);
  }

  // Ensure every country has exactly 6 players covering GK, DEF, MID, FWD
  for (const c of countries) {
    const cId = c.id;
    const countryPlayers = playersByCountry[cId] || [];
    
    // Count per position
    const gks = countryPlayers.filter(p => p.position === 'GK');
    const defs = countryPlayers.filter(p => p.position === 'DEF');
    const mids = countryPlayers.filter(p => p.position === 'MID');
    const fwds = countryPlayers.filter(p => p.position === 'FWD');

    console.log(`Country ${cId}: GK=${gks.length}, DEF=${defs.length}, MID=${mids.length}, FWD=${fwds.length}`);

    // We want to achieve: 1 GK, 2 DEF, 2 MID, 1 FWD
    const needed = [];
    if (gks.length < 1) needed.push('GK');
    if (defs.length < 2) {
      const diff = 2 - defs.length;
      for (let i = 0; i < diff; i++) needed.push('DEF');
    }
    if (mids.length < 2) {
      const diff = 2 - mids.length;
      for (let i = 0; i < diff; i++) needed.push('MID');
    }
    if (fwds.length < 1) needed.push('FWD');

    // If we still need more to reach 6 total players (e.g. if the country has 3 players but covers GK, DEF, MID, FWD)
    const currentTotal = countryPlayers.length + needed.length;
    if (currentTotal < 6) {
      const fillDiff = 6 - currentTotal;
      // Add random positions prioritizing DEF/MID/FWD
      const pool = ['DEF', 'MID', 'FWD'];
      for (let i = 0; i < fillDiff; i++) {
        needed.push(pool[Math.floor(Math.random() * pool.length)]);
      }
    }

    // Generate the needed players
    for (const pos of needed) {
      // Choose rating between 70 and 88 for typical new players
      const rating = Math.floor(70 + Math.random() * 19); 
      
      // Calculate realistic price based on position and rating
      let minPrice = 4.0;
      let maxPrice = 8.5;
      if (pos === 'FWD') {
        minPrice = 5.0;
        maxPrice = 10.0;
      } else if (pos === 'MID') {
        minPrice = 4.5;
        maxPrice = 9.5;
      }
      
      const price = minPrice + (maxPrice - minPrice) * ((rating - 70) / 18);
      const roundedPrice = Math.round(price * 2) / 2; // Round to nearest 0.5M

      const newPlayer = {
        id: nextId++,
        name: getRandomName(cId),
        countryId: cId,
        position: pos,
        price: roundedPrice,
        rating: rating
      };

      players.push(newPlayer);
      countryPlayers.push(newPlayer);
      console.log(`  Added player: ${newPlayer.name} (${pos}), Rating: ${rating}, Price: $${roundedPrice}M`);
    }
    
    // If the country has more than 6, we keep them. But we make sure it's at least 6.
    playersByCountry[cId] = countryPlayers;
  }

  // Sort players by id
  players.sort((a, b) => a.id - b.id);

  console.log(`New total players count: ${players.length}`);

  // Write back to seedData.json
  fs.writeFileSync(SEED_DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log("Successfully updated seedData.json!");
}

run();
