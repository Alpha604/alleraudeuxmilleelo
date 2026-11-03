/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addTrustedIp,
  formatIpPrefix,
  generateSessionValidationCode,
  getMobileAuthUrl,
  getTrustedIps,
  hashPassword,
  isIpTrusted,
  removeTrustedIp,
  setTrustedIps,
  updateAdminPassword,
  verifyAdminPassword,
} from './security';

async function runSecurityTests() {
  console.log('--- TEST DE SÉCURITÉ 2FA, MULTI-IPS ET SCAN EN DIRECT ---');

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

  // Test 7: Multi-IPs handling
  setTrustedIps(['82.64.12.34', '192.168.1.50']);
  let ips = getTrustedIps();
  if (ips.length === 2 && ips.includes('82.64.12.34') && ips.includes('192.168.1.50')) {
    console.log('✅ PASSED: Enregistrement et lecture de multiples IPs de confiance');
  } else {
    throw new Error('FAILED: Erreur sur setTrustedIps');
  }

  // Test 8: Adding additional IP
  addTrustedIp('176.150.20.10');
  ips = getTrustedIps();
  if (ips.length === 3 && isIpTrusted('176.150.20.10')) {
    console.log('✅ PASSED: Ajout d\'une nouvelle IP dans la liste');
  } else {
    throw new Error('FAILED: Erreur sur addTrustedIp');
  }

  // Test 9: isIpTrusted match and mismatch
  if (isIpTrusted('82.64.12.34') && !isIpTrusted('10.0.0.1')) {
    console.log('✅ PASSED: Vérification isIpTrusted conforme');
  } else {
    throw new Error('FAILED: Erreur sur isIpTrusted');
  }

  // Test 10: Removing an IP
  removeTrustedIp('82.64.12.34');
  ips = getTrustedIps();
  if (ips.length === 2 && !ips.includes('82.64.12.34')) {
    console.log('✅ PASSED: Suppression ciblée d\'une IP dans la liste');
  } else {
    throw new Error('FAILED: Erreur sur removeTrustedIp');
  }

  // Test 11: formatIpPrefix masking
  const p1 = formatIpPrefix('82.64.12.34');
  const p2 = formatIpPrefix('2001:0db8:85a3::1');
  if (p1 === '82.64.***' && p2.startsWith('2001:0db8:')) {
    console.log(`✅ PASSED: Masquage IP préfixe valide (${p1}, ${p2})`);
  } else {
    throw new Error(`FAILED: Format de préfixe IP incorrect (${p1}, ${p2})`);
  }

  // Test 12: Anti-spoofing - getMobileAuthUrl strictly excludes &tips= query parameter
  const mobileUrl = getMobileAuthUrl('session_xyz123', 'https://example.com');
  if (!mobileUrl.includes('&tips=') && !mobileUrl.includes('?tips=') && mobileUrl.includes('mobile_auth=session_xyz123')) {
    console.log('✅ PASSED: Anti-spoofing URL - Aucun paramètre d\'IP de confiance n\'est injecté dans le lien mobile');
  } else {
    throw new Error(`FAILED: Paramètre d'IP de confiance non sécurisé détecté dans l'URL (${mobileUrl})`);
  }

  // Test 13: Local and external IP format validation
  if (isIpTrusted('192.168.1.50') && !isIpTrusted('203.0.113.195')) {
    console.log('✅ PASSED: Filtrage strict des adresses non autorisées');
  } else {
    throw new Error('FAILED: Filtrage d\'adresse IP incohérent');
  }

  console.log('--- TOUS LES TESTS DE SÉCURITÉ 2FA, ANTI-SPOOFING ET MULTI-IPS SONT VALIDÉS AVEC SUCCÈS ! ---');
}

runSecurityTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
