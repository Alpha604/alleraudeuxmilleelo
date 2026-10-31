/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone verification test suite for eloEngine.
 * Run with: npx tsx src/utils/eloEngine.test.ts
 */

import {
  calculateDailyObjective,
  calculateLinearElo,
  calculateProgressPercentage,
  DEFAULT_START_DATE,
  DEFAULT_START_ELO,
  DEFAULT_TARGET_DATE,
  DEFAULT_TARGET_ELO,
  getBestGameMode,
} from './eloEngine';
import { ChessComStatsResponse } from '../types/chess';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('--- EXÉCUTION DE LA SUITE DE TESTS DU MOTEUR ROAD TO 2000 ELO ---');

// 1. Elo inférieur à 1500
{
  const percentage = calculateProgressPercentage(1420, 1500, 2000);
  assert(percentage === 0, 'Cas 1: Elo < 1500 retourne 0% (sans pourcentage négatif)');
  const obj = calculateDailyObjective(1420, '2026-10-31T00:00:00');
  assert(obj.realElo === 1420, 'Cas 1b: Valeur réelle 1420 Elo préservée');
}

// 2. Elo égal à 1500
{
  const percentage = calculateProgressPercentage(1500, 1500, 2000);
  assert(percentage === 0, 'Cas 2: Elo = 1500 retourne 0%');
  const obj = calculateDailyObjective(1500, '2026-10-31T00:00:00');
  assert(obj.diff === 0, 'Cas 2b: Écart nul à la date de départ');
}

// 3. Elo compris entre 1500 et 2000
{
  const percentage = calculateProgressPercentage(1750, 1500, 2000);
  assert(percentage === 50, 'Cas 3: 1750 Elo donne exactement 50.0%');
}

// 4. Elo égal ou supérieur à 2000
{
  const percentage = calculateProgressPercentage(2050, 1500, 2000);
  assert(percentage === 100, 'Cas 4: Elo >= 2000 plafonné à 100%');
  const obj = calculateDailyObjective(2050);
  assert(obj.status === 'goal_reached', 'Cas 4b: Statut goal_reached');
}

// 5. Date de départ
{
  const target = calculateLinearElo('2026-10-31T00:00:00', DEFAULT_START_DATE, DEFAULT_TARGET_DATE, 1500, 2000);
  assert(target === 1500, 'Cas 5: Date de départ 31/10/2026 donne 1500 Elo');
}

// 6. Date limite
{
  const target = calculateLinearElo('2027-12-31T23:59:59', DEFAULT_START_DATE, DEFAULT_TARGET_DATE, 1500, 2000);
  assert(target === 2000, 'Cas 6: Date limite 31/12/2027 donne 2000 Elo');
}

// 7. Date après l'échéance
{
  const target = calculateLinearElo('2028-02-01T00:00:00', DEFAULT_START_DATE, DEFAULT_TARGET_DATE, 1500, 2000);
  assert(target === 2000, 'Cas 7: Date après échéance plafonnée à 2000 Elo');
  const obj = calculateDailyObjective(1850, '2028-02-01T00:00:00');
  assert(obj.status === 'deadline_passed', 'Cas 7b: Statut deadline_passed');
}

// 8. Données API manquantes
{
  const stats: ChessComStatsResponse = {
    chess_bullet: { last: { rating: 1510, date: 1790000000 } },
  };
  const best = getBestGameMode(stats);
  assert(best.mode === 'bullet' && best.rating === 1510, 'Cas 8: Sélection bullet quand blitz/rapide absents');
}

// 9. Égalité entre deux modes
{
  const stats: ChessComStatsResponse = {
    chess_blitz: { last: { rating: 1600, date: 1790000000 } },
    chess_rapid: { last: { rating: 1600, date: 1790000000 } },
    chess_bullet: { last: { rating: 1400, date: 1790000000 } },
  };
  const best = getBestGameMode(stats);
  assert(best.mode === 'rapid' && best.rating === 1600, 'Cas 9: Égalité départagée en faveur du rapide');
}

// 10. Erreur réseau / Historique vide
{
  const best = getBestGameMode(null);
  assert(best.rating === DEFAULT_START_ELO, 'Cas 10: Repli gracieux sur 1500 Elo');
  const percentage = calculateProgressPercentage(best.rating);
  assert(percentage === 0, 'Cas 10b: 0% sans plantage');
}

console.log('--- TOUS LES 10 CAS DE TESTS SONT VALIDÉS AVEC SUCCÈS ! ---');
