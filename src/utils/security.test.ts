/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  generateSessionValidationCode,
  getTrustedIp,
  hashPassword,
  removeTrustedIp,
  setTrustedIp,
  updateAdminPassword,
  verifyAdminPassword,
} from './security';

async function runSecurityTests() {
  console.log('--- TEST DE SÉCURITÉ 2FA ET GESTION DES MOTS DE PASSE (Alpha604) ---');

  // Test 1: Hash generation is deterministic and case-insensitive
  const h1 = await hashPassword('Alpha604');
  const h2 = await hashPassword('alpha604');
  const h3 = await hashPassword('ALPHA604');
  if (h1 === h2 && h2 === h3 && h1.length > 0) {
    console.log('✅ PASSED: Hashage déterministe et insensible à la casse (Alpha604 === alpha604)');
  } else {
    throw new Error('FAILED: Hashage non déterministe ou sensible à la casse');
  }

  // Test 2: Different passwords generate different hashes
  const hOther = await hashPassword('autre_mdp');
  if (h1 !== hOther) {
    console.log('✅ PASSED: Mots de passe différents ont des hashs distincts');
  } else {
    throw new Error('FAILED: Collision de hash');
  }

  // Test 3: Default password verification with various casings
  const isValidMixedCase = await verifyAdminPassword('Alpha604');
  const isValidLowerCase = await verifyAdminPassword('alpha604');
  const isValidUpperCase = await verifyAdminPassword('ALPHA604');
  const isValidWithSpaces = await verifyAdminPassword('  Alpha604  ');

  if (isValidMixedCase && isValidLowerCase && isValidUpperCase && isValidWithSpaces) {
    console.log('✅ PASSED: Mot de passe par défaut Alpha604 validé sous toutes ses formes');
  } else {
    throw new Error('FAILED: Mot de passe par défaut Alpha604 non reconnu');
  }

  // Test 4: Old default password rejected
  const isOldDefaultValid = await verifyAdminPassword('2000elo');
  if (!isOldDefaultValid) {
    console.log('✅ PASSED: Ancien mot de passe (2000elo) correctement rejeté');
  } else {
    throw new Error('FAILED: Ancien mot de passe 2000elo encore accepté');
  }

  // Test 5: Incorrect password rejected
  const isWrongValid = await verifyAdminPassword('mauvais_mdp');
  if (!isWrongValid) {
    console.log('✅ PASSED: Mauvais mot de passe rejeté');
  } else {
    throw new Error('FAILED: Mauvais mot de passe accepté');
  }

  // Test 6: Session validation code is 6 digits
  const code1 = generateSessionValidationCode('sess_123456');
  if (/^\d{6}$/.test(code1)) {
    console.log(`✅ PASSED: Code d'autorisation 6 chiffres généré: ${code1}`);
  } else {
    throw new Error(`FAILED: Format de code invalide (${code1})`);
  }

  // Test 7: Same session generates same code
  const code2 = generateSessionValidationCode('sess_123456');
  if (code1 === code2) {
    console.log('✅ PASSED: Code de validation identique pour la même session');
  } else {
    throw new Error('FAILED: Code divergent pour la même session');
  }

  // Test 8: Trusted IP handling
  setTrustedIp('82.64.12.34');
  if (getTrustedIp() === '82.64.12.34') {
    console.log('✅ PASSED: Enregistrement et lecture de l\'IP de confiance valides');
  } else {
    throw new Error('FAILED: Erreur sur getTrustedIp');
  }
  removeTrustedIp();
  if (getTrustedIp() === '') {
    console.log('✅ PASSED: Suppression de l\'IP de confiance valide');
  } else {
    throw new Error('FAILED: Erreur sur removeTrustedIp');
  }

  console.log('--- TOUS LES TESTS DE SÉCURITÉ SONT VALIDÉS AVEC SUCCÈS ! ---');
}

runSecurityTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
