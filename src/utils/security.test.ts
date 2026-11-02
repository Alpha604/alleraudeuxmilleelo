/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  generateSessionValidationCode,
  hashPassword,
  updateAdminPassword,
  verifyAdminPassword,
} from './security';

async function runSecurityTests() {
  console.log('--- TEST DE SÉCURITÉ 2FA ET GESTION DES MOTS DE PASSE ---');

  // Test 1: Hash generation is deterministic
  const h1 = await hashPassword('2000elo');
  const h2 = await hashPassword('2000elo');
  if (h1 === h2 && h1.length > 0) {
    console.log('✅ PASSED: Hashage déterministe valide');
  } else {
    throw new Error('FAILED: Hashage non déterministe');
  }

  // Test 2: Different passwords generate different hashes
  const h3 = await hashPassword('autre_mdp');
  if (h1 !== h3) {
    console.log('✅ PASSED: Mots de passe différents ont des hashs distincts');
  } else {
    throw new Error('FAILED: Collision de hash');
  }

  // Test 3: Default password verification
  const isDefaultValid = await verifyAdminPassword('2000elo');
  if (isDefaultValid) {
    console.log('✅ PASSED: Mot de passe par défaut 2000elo reconnu');
  } else {
    throw new Error('FAILED: Mot de passe par défaut non reconnu');
  }

  // Test 4: Incorrect password rejected
  const isWrongValid = await verifyAdminPassword('mauvais_mdp');
  if (!isWrongValid) {
    console.log('✅ PASSED: Mauvais mot de passe rejeté');
  } else {
    throw new Error('FAILED: Mauvais mot de passe accepté');
  }

  // Test 5: Session validation code is 6 digits
  const code1 = generateSessionValidationCode('sess_123456');
  if (/^\d{6}$/.test(code1)) {
    console.log(`✅ PASSED: Code d'autorisation 6 chiffres généré: ${code1}`);
  } else {
    throw new Error(`FAILED: Format de code invalide (${code1})`);
  }

  // Test 6: Same session generates same code
  const code2 = generateSessionValidationCode('sess_123456');
  if (code1 === code2) {
    console.log('✅ PASSED: Code de validation identique pour la même session');
  } else {
    throw new Error('FAILED: Code divergent pour la même session');
  }

  console.log('--- TOUS LES TESTS DE SÉCURITÉ SONT VALIDÉS AVEC SUCCÈS ! ---');
}

runSecurityTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
