/**
 * One-time data migration for the authentication rewrite.
 *
 * Run once after `prisma db push`:
 *     npm run migrate:auth
 *
 * Idempotent — safe to run repeatedly.
 *
 * What it does, and why:
 *
 *  1. `CANDIDATE` -> `USER`. The enum value is retained in the schema so old rows stay
 *     readable, but everything downstream normalises to USER; this makes the data match.
 *
 *  2. Grandfathers existing accounts as email-verified. `emailVerified` was added with a
 *     default of `false`, and these accounts predate verification entirely — leaving them
 *     false would lock every existing user out of an app they could use yesterday. The old
 *     `isVerified` column (default true) is the signal being honoured here.
 *
 *  3. Re-applies the ADMIN_EMAILS list, so the configured admins hold ADMIN and nobody
 *     else does.
 *
 *  4. Backfills `lastActive`/`lastLogin` from `createdAt` so the profile and admin screens
 *     have something truthful rather than "never".
 *
 * What it deliberately does NOT do: invent passwords or mobile numbers. Accounts created
 * by the previous passwordless flow have `passwordHash = null`; those users sign in with
 * Google, or use "Forgot password" to set a password for the first time. `mobile` stays
 * null until they fill it in on their profile.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { prisma } = require('../src/shared/db');
const { authConfig, roleForEmail } = require('../src/features/auth/authConfig');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const label = dryRun ? '[dry-run]' : '[migrate]';

  console.log('='.repeat(66));
  console.log('NextHire — auth data migration');
  console.log(`Configured admin emails: ${authConfig.adminEmails.join(', ') || '(none)'}`);
  if (dryRun) console.log('DRY RUN — no writes will be performed.');
  console.log('='.repeat(66));

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Found ${users.length} user(s).\n`);

  let roleChanges = 0;
  let verifiedGrandfathered = 0;
  let activityBackfilled = 0;
  let profilesCreated = 0;

  for (const user of users) {
    const changes = {};
    const notes = [];

    // 1 + 3 — canonical role, with the admin list authoritative.
    const entitled = roleForEmail(user.email);
    const targetRole = entitled === 'ADMIN' ? 'ADMIN' : user.role === 'ADMIN' ? 'USER' : user.role === 'CANDIDATE' ? 'USER' : user.role;
    if (targetRole !== user.role) {
      changes.role = targetRole;
      notes.push(`role ${user.role} -> ${targetRole}`);
      roleChanges += 1;
    }

    // 2 — grandfather pre-existing accounts as verified.
    if (!user.emailVerified && user.isVerified) {
      changes.emailVerified = true;
      changes.emailVerifiedAt = user.createdAt;
      notes.push('email marked verified (pre-existing account)');
      verifiedGrandfathered += 1;
    }
    // Keep the legacy column consistent with the new one either way.
    if (user.emailVerified && !user.isVerified) {
      changes.isVerified = true;
    }

    // 4 — activity backfill.
    if (!user.lastActive) {
      changes.lastActive = user.lastLogin || user.createdAt;
      activityBackfilled += 1;
    }

    if (Object.keys(changes).length) {
      console.log(`${label} ${user.email}: ${notes.length ? notes.join('; ') : 'activity backfill'}`);
      if (!dryRun) {
        await prisma.user.update({ where: { id: user.id }, data: changes });
      }
    }

    // Several features assume a Profile row exists.
    const profile = await prisma.profile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!profile) {
      console.log(`${label} ${user.email}: creating missing profile row`);
      profilesCreated += 1;
      if (!dryRun) {
        await prisma.profile.create({ data: { userId: user.id } });
      }
    }
  }

  // Sessions minted by the previous scheme do not exist (there was no session table), but
  // any refresh cookie a browser is still holding would now be unrecognised. Nothing to
  // clean up — an unknown refresh token simply fails and the user signs in again.

  console.log(`\n${'='.repeat(66)}`);
  console.log('Summary');
  console.log(`  roles updated            : ${roleChanges}`);
  console.log(`  grandfathered as verified: ${verifiedGrandfathered}`);
  console.log(`  activity backfilled      : ${activityBackfilled}`);
  console.log(`  profiles created         : ${profilesCreated}`);
  console.log(`  accounts without password: ${users.filter((u) => !u.passwordHash).length} (Google sign-in or "Forgot password" to set one)`);
  console.log('='.repeat(66));

  if (dryRun) console.log('\nNothing was written. Re-run without --dry-run to apply.');
}

main()
  .catch((err) => {
    console.error('\n[migrate] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
