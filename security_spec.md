# Security Specification — Road to 2000 Elo Firestore Mirror

## 1. Data Invariants
1. **Owner & Verified Admin Exclusivity**: No unauthenticated or unverified user (`email_verified != true`) may read or write any `/players`, `/dailyRecords`, or `/users` document.
2. **Strict Ownership Integrity**: Every `PlayerMirror` and `DailySyncRecord` document must bind `ownerUid == request.auth.uid` on creation and preserve `ownerUid == existing().ownerUid` forever.
3. **Parent Gate Relational Sync**: A `DailySyncRecord` under `/players/{playerId}/dailyRecords/{dayKey}` cannot be created, updated, or deleted unless the parent `/players/{playerId}` document exists (or existsAfter in the same batch) AND belongs to `request.auth.uid` (or verified admin). Furthermore, `incoming().username == playerId` and `incoming().dayKey == dayKey` must hold.
4. **Temporal & Structural Integrity**: `createdAt` must equal `request.time` on creation and remain immutable on update; `updatedAt` must equal `request.time` on every write. Exact `hasAll` / `hasOnly` field allowlists prevent shadow fields.

## 2. "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Read**: `get(/players/alpharomeo1500)` with `auth = null`.
2. **Unverified Email Spoof**: `setDoc(/players/alpharomeo1500)` with `email = 'romeo.brawlstars59@gmail.com'` and `email_verified = false`.
3. **Cross-Tenant Identity Spoofing**: User B creates `/players/alpharomeo1500` with `ownerUid = 'user_A'`.
4. **Shadow Field Injection**: Create `/players/alpharomeo1500` with extra `isAdmin: true` or `role: 'superadmin'` field.
5. **Client Timestamp Forgery**: Create `/players/alpharomeo1500` with `createdAt: '2020-01-01T00:00:00Z'` instead of `request.time`.
6. **Immutable `createdAt` Tampering**: Update `/players/alpharomeo1500` while modifying `createdAt`.
7. **Immutable `ownerUid` Reassignment**: Update `/players/alpharomeo1500` changing `ownerUid` to another UID.
8. **Path ID Poisoning (Denial of Wallet)**: Create `/players/<1.5KB-junk-id>` or `/players/Alpha!Invalid` violating `^[a-z0-9_\-]+$` / `size() <= 40`.
9. **Orphaned Daily Record**: Create `/players/unknown_player/dailyRecords/2026-11-10` when parent `/players/unknown_player` does not exist.
10. **Daily Record `dayKey` Mismatch**: Create `/players/alpharomeo1500/dailyRecords/2026-11-10` with `dayKey: '2026-11-11'`.
11. **Value Type / Bounds Poisoning**: Update `bestRating: "not-a-number"` or `bestRating: 99999` or `note` string > 240 chars.
12. **Blanket List Query Scraping**: Non-owner authenticated user executes `list` on `/players` or `/users` or `dailyRecords`.
